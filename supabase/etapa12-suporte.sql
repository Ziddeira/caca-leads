-- Caça-leads — Etapa 12: "Preciso de ajuda" (chamados de suporte)
-- Rode DEPOIS de todos os scripts anteriores (até a etapa 11), inteiro,
-- de uma vez: Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Regras desta etapa:
--   * cada usuário só vê os próprios chamados; só o administrador
--     (profiles.is_admin, etapa 11) vê todos e responde;
--   * no máximo 5 chamados abertos (não resolvidos) por usuário;
--   * os dados de diagnóstico da conta (e-mail, plano, saldo) são
--     preenchidos PELO BANCO na hora de abrir o chamado — o navegador só
--     informa a página e o navegador em uso;
--   * a imagem anexada fica num bucket privado, na pasta do usuário;
--   * quando você responde, o usuário recebe um aviso no sino.

-- 1. Bucket "suporte" (imagem, até 5 MB) ---------------------------------------
-- PRIVADO: ninguém tem link público. O dono envia para a própria pasta
-- ("<id do usuário>/<número>.<ext>"); só o dono e o administrador abrem.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'suporte',
  'suporte',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Suporte: dono envia na própria pasta" on storage.objects;
create policy "Suporte: dono envia na própria pasta"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'suporte'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Suporte: dono e administrador leem" on storage.objects;
create policy "Suporte: dono e administrador leem"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'suporte'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_admin())
  );

-- Sem política de update/delete: depois de enviado, o arquivo não muda.

-- 2. Tabela "chamados" ---------------------------------------------------------
-- assunto: problema_tecnico | planos_cobranca | sugestao | outro.
-- situacao: aberto (esperando você) | respondido (você respondeu) |
--   resolvido (encerrado, por você ou pelo próprio usuário).
-- diagnostico: retrato da conta na hora do chamado (e-mail, plano, saldo,
--   página, navegador), para você não precisar perguntar.
-- email_copia_enviada_em: preparado para a cópia por e-mail no futuro
--   (lib/suporte/email.ts). Por enquanto fica sempre nulo.
create table if not exists public.chamados (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  assunto text not null check (assunto in ('problema_tecnico', 'planos_cobranca', 'sugestao', 'outro')),
  descricao text not null check (char_length(descricao) between 1 and 1000),
  anexo_path text,
  situacao text not null default 'aberto' check (situacao in ('aberto', 'respondido', 'resolvido')),
  diagnostico jsonb not null default '{}'::jsonb,
  resposta text check (resposta is null or char_length(resposta) between 1 and 2000),
  respondido_em timestamptz,
  respondido_por uuid references auth.users (id) on delete set null,
  resolvido_em timestamptz,
  email_copia_enviada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists chamados_user_criado_idx
  on public.chamados (user_id, criado_em desc);
create index if not exists chamados_situacao_idx
  on public.chamados (situacao, criado_em);

alter table public.chamados enable row level security;

grant usage on schema public to authenticated;
grant select on public.chamados to authenticated;
-- Ninguém escreve direto: abrir, responder e resolver passam pelas
-- funções abaixo.
revoke insert, update, delete on public.chamados from authenticated, anon;

drop policy if exists "Usuários veem os próprios chamados; administrador vê todos" on public.chamados;
create policy "Usuários veem os próprios chamados; administrador vê todos"
  on public.chamados
  for select
  to authenticated
  using (user_id = auth.uid() or public.eh_admin());

-- 3. Notificação do tipo "suporte" ---------------------------------------------
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes drop constraint if exists notificacoes_tipo_valido;
alter table public.notificacoes
  add constraint notificacoes_tipo_valido check (
    tipo in ('renovacao', 'saldo', 'novidade', 'incentivo', 'retorno', 'suporte')
  );

-- 4. Limite de chamados abertos (um lugar só para mudar) ------------------------
-- Mantenha igual a lib/suporte/regras.ts (que só serve para a tela).
create or replace function public.limite_chamados_abertos()
returns integer
language sql
immutable
as $$
  select 5;
$$;

-- 5. Abrir chamado (usuário) ------------------------------------------------------
create or replace function public.abrir_chamado(
  p_assunto text,
  p_descricao text,
  p_anexo_path text,
  p_pagina text,
  p_navegador text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_descricao text := btrim(coalesce(p_descricao, ''));
  v_anexo text := nullif(btrim(coalesce(p_anexo_path, '')), '');
  v_perfil public.profiles%rowtype;
  v_abertos integer;
  v_id bigint;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  if p_assunto is null or p_assunto not in ('problema_tecnico', 'planos_cobranca', 'sugestao', 'outro') then
    raise exception 'Escolha o assunto.';
  end if;
  if char_length(v_descricao) < 1 then
    raise exception 'Descreva o que aconteceu.';
  end if;
  if char_length(v_descricao) > 1000 then
    raise exception 'A descrição pode ter no máximo 1000 caracteres.';
  end if;

  -- Trava o perfil: dois envios ao mesmo tempo não furam o limite.
  select * into v_perfil from public.profiles where id = auth.uid() for update;
  if v_perfil.id is null then
    raise exception 'Perfil não encontrado.';
  end if;

  select count(*) into v_abertos
    from public.chamados
    where user_id = auth.uid() and situacao <> 'resolvido';
  if v_abertos >= public.limite_chamados_abertos() then
    raise exception 'Você já tem % chamados abertos. Marque como resolvido os que já foram atendidos ou aguarde a resposta antes de abrir outro.',
      v_abertos;
  end if;

  if v_anexo is not null then
    if v_anexo !~ ('^' || auth.uid()::text || '/[0-9]+\.(jpg|png|webp)$') then
      raise exception 'Arquivo anexado inválido.';
    end if;
    if not exists (
      select 1 from storage.objects where bucket_id = 'suporte' and name = v_anexo
    ) then
      raise exception 'A imagem anexada não foi encontrada. Envie de novo.';
    end if;
    if exists (select 1 from public.chamados where anexo_path = v_anexo) then
      raise exception 'Esta imagem já foi usada em outro chamado.';
    end if;
  end if;

  insert into public.chamados (user_id, assunto, descricao, anexo_path, diagnostico)
  values (
    auth.uid(),
    p_assunto,
    v_descricao,
    v_anexo,
    jsonb_build_object(
      'email', v_perfil.email,
      'apelido', v_perfil.apelido,
      'plano', v_perfil.plano,
      'plano_valido_ate', v_perfil.plano_valido_ate,
      'creditos_desbloqueio', v_perfil.creditos_desbloqueio,
      'creditos_premio', v_perfil.creditos_premio,
      'buscas_restantes', v_perfil.buscas_restantes,
      'assinatura', (select a.status from public.assinaturas a
                      where a.user_id = auth.uid()
                      order by (a.status <> 'cancelada') desc, a.criado_em desc
                      limit 1),
      'pagina', left(nullif(btrim(coalesce(p_pagina, '')), ''), 300),
      'navegador', left(nullif(btrim(coalesce(p_navegador, '')), ''), 500)
    )
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.abrir_chamado(text, text, text, text, text) from public, anon;
grant execute on function public.abrir_chamado(text, text, text, text, text) to authenticated;

-- 6. Marcar como resolvido (o próprio usuário) ------------------------------------
create or replace function public.resolver_meu_chamado(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  update public.chamados
     set situacao = 'resolvido',
         resolvido_em = now(),
         atualizado_em = now()
   where id = p_id
     and user_id = auth.uid()
     and situacao <> 'resolvido';

  if not found then
    raise exception 'Chamado não encontrado ou já resolvido.';
  end if;
end;
$$;

revoke all on function public.resolver_meu_chamado(bigint) from public, anon;
grant execute on function public.resolver_meu_chamado(bigint) to authenticated;

-- 7. Gestão > Suporte (administrador) ---------------------------------------------
-- Lista com o apelido e o e-mail atuais de quem abriu. Filtro opcional
-- pela situação.
create or replace function public.admin_listar_chamados(p_situacao text default null)
returns table (
  id bigint,
  user_id uuid,
  email text,
  apelido text,
  assunto text,
  descricao text,
  anexo_path text,
  situacao text,
  diagnostico jsonb,
  resposta text,
  respondido_em timestamptz,
  resolvido_em timestamptz,
  criado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  return query
    select c.id, c.user_id, p.email, p.apelido, c.assunto, c.descricao, c.anexo_path,
           c.situacao, c.diagnostico, c.resposta, c.respondido_em, c.resolvido_em, c.criado_em
      from public.chamados c
      left join public.profiles p on p.id = c.user_id
      where p_situacao is null or c.situacao = p_situacao
      order by (c.situacao = 'aberto') desc, c.criado_em desc
      limit 300;
end;
$$;

revoke all on function public.admin_listar_chamados(text) from public, anon;
grant execute on function public.admin_listar_chamados(text) to authenticated;

-- Responde e/ou muda a situação. Quando há resposta nova, o usuário
-- recebe um aviso no sino. Tudo fica na auditoria (etapa 11).
--   p_situacao: respondido | resolvido | aberto (reabrir).
create or replace function public.admin_responder_chamado(
  p_id bigint,
  p_resposta text,
  p_situacao text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes public.chamados%rowtype;
  v_resposta text := nullif(btrim(coalesce(p_resposta, '')), '');
  v_nova_resposta boolean;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  if p_situacao is null or p_situacao not in ('aberto', 'respondido', 'resolvido') then
    raise exception 'Situação inválida.';
  end if;
  if char_length(v_resposta) > 2000 then
    raise exception 'A resposta pode ter no máximo 2000 caracteres.';
  end if;

  select * into v_antes from public.chamados where id = p_id for update;
  if v_antes.id is null then
    raise exception 'Chamado não encontrado.';
  end if;

  if p_situacao = 'respondido' and v_resposta is null then
    raise exception 'Escreva a resposta.';
  end if;

  v_nova_resposta := v_resposta is not null and v_resposta is distinct from v_antes.resposta;

  if not v_nova_resposta and p_situacao = v_antes.situacao then
    raise exception 'Nada mudou.';
  end if;

  update public.chamados
     set resposta = coalesce(v_resposta, resposta),
         respondido_em = case when v_nova_resposta then now() else respondido_em end,
         respondido_por = case when v_nova_resposta then auth.uid() else respondido_por end,
         situacao = p_situacao,
         resolvido_em = case when p_situacao = 'resolvido' then coalesce(resolvido_em, now()) else null end,
         atualizado_em = now()
   where id = p_id;

  if v_nova_resposta then
    insert into public.notificacoes (user_id, tipo, titulo, texto, link)
    values (
      v_antes.user_id,
      'suporte',
      'Seu chamado de suporte foi respondido',
      left(v_resposta, 560) || case when char_length(v_resposta) > 560 then '…' else '' end,
      '/painel/suporte'
    );
  end if;

  perform public.registrar_auditoria(
    'chamado_respondido',
    v_antes.user_id,
    jsonb_build_object('chamado_id', v_antes.id, 'situacao', v_antes.situacao),
    jsonb_build_object('chamado_id', v_antes.id, 'situacao', p_situacao,
                       'resposta_nova', v_nova_resposta),
    null
  );

  return p_situacao;
end;
$$;

revoke all on function public.admin_responder_chamado(bigint, text, text) from public, anon;
grant execute on function public.admin_responder_chamado(bigint, text, text) to authenticated;

-- 8. Cópia por e-mail (futuro) -----------------------------------------------------
-- Quando houver um serviço de e-mail, o servidor (service_role) marca aqui
-- que a cópia do chamado foi enviada.
create or replace function public.marcar_email_chamado_enviado(p_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chamados set email_copia_enviada_em = now() where id = p_id;
$$;

revoke all on function public.marcar_email_chamado_enviado(bigint) from public, anon, authenticated;
grant execute on function public.marcar_email_chamado_enviado(bigint) to service_role;

notify pgrst, 'reload schema';
