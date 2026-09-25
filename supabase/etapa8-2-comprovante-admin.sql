-- Ártemis Prospect — Etapa 8, parte 2 de 3: comprovante, administrador e score
-- Rode DEPOIS da parte 1 (etapa8-1-verificacao.sql), inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Dica: copie pelo botão "Copy raw file" do GitHub (ou abra o arquivo
-- no editor e use Ctrl+A). Se a cópia vier cortada, o Supabase acusa
-- erro de sintaxe numa linha do meio, como "syntax error at or near".

-- 9. Comprovante manual (imagem ou PDF, até 5 MB) ----------------------------
-- Bucket PRIVADO: ninguém tem link público. O dono envia para a própria
-- pasta ("<id do usuário>/<id da venda>-<número>.<ext>"); só o dono e os
-- administradores conseguem abrir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprovantes',
  'comprovantes',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Administradores (só você). Ninguém recebe GRANT: você se cadastra pelo
-- SQL Editor (passo 14).
create table if not exists public.administradores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.administradores enable row level security;
revoke all on public.administradores from anon, authenticated;

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.administradores where user_id = auth.uid());
$$;

revoke all on function public.eh_admin() from public, anon;
grant execute on function public.eh_admin() to authenticated;

drop policy if exists "Comprovantes: dono envia na própria pasta" on storage.objects;
create policy "Comprovantes: dono envia na própria pasta"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Comprovantes: dono e administrador leem" on storage.objects;
create policy "Comprovantes: dono e administrador leem"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'comprovantes'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_admin())
  );

-- Sem política de update/delete: depois de enviado, o arquivo não muda.

-- Liga o comprovante (já enviado ao Storage) à venda e manda para análise.
-- Só depois de N tentativas automáticas sem confirmação.
create or replace function public.enviar_comprovante(p_venda_id bigint, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda public.vendas%rowtype;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  select * into v_venda from public.vendas
    where id = p_venda_id and user_id = auth.uid()
    for update;

  if v_venda.id is null then
    raise exception 'Venda não encontrada.';
  end if;

  if v_venda.status not in ('pendente_verificacao', 'aguardando_google', 'nao_verificada') then
    raise exception 'Esta venda não aceita comprovante agora.';
  end if;

  if v_venda.tentativas < public.tentativas_para_comprovante() then
    raise exception 'O comprovante fica disponível depois de % verificações automáticas sem confirmação.',
      public.tentativas_para_comprovante();
  end if;

  if p_path is null
    or p_path !~ ('^' || auth.uid()::text || '/' || p_venda_id::text || '-[0-9]+\.(jpg|png|webp|pdf)$') then
    raise exception 'Arquivo do comprovante inválido.';
  end if;

  if not exists (
    select 1 from storage.objects where bucket_id = 'comprovantes' and name = p_path
  ) then
    raise exception 'O arquivo do comprovante não foi encontrado. Envie de novo.';
  end if;

  update public.vendas
    set status = 'em_analise',
        comprovante_path = p_path,
        comprovante_enviado_em = now(),
        motivo_verificacao = null
    where id = v_venda.id;
end;
$$;

revoke all on function public.enviar_comprovante(bigint, text) from public, anon;
grant execute on function public.enviar_comprovante(bigint, text) to authenticated;

-- 10. Tela do administrador ----------------------------------------------------
-- Lista as vendas com comprovante esperando análise. Recusa quem não é
-- administrador (a tela também esconde, mas quem decide é o banco).
create or replace function public.vendas_em_analise()
returns table (
  venda_id bigint,
  apelido text,
  email text,
  place_id text,
  nome_empresa text,
  site_url text,
  fechado_em date,
  tentativas integer,
  ultimo_motivo text,
  comprovante_path text,
  comprovante_enviado_em timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  return query
    select v.id, p.apelido, p.email, v.place_id,
           (to_jsonb(l) -> 'dados' ->> 'nome'),
           v.site_url, v.fechado_em, v.tentativas,
           (select vv.motivo from public.verificacoes_venda vv
             where vv.venda_id = v.id and vv.origem = 'automatica'
             order by vv.criado_em desc limit 1),
           v.comprovante_path, v.comprovante_enviado_em
      from public.vendas v
      join public.profiles p on p.id = v.user_id
      left join public.leads_desbloqueados l
        on l.user_id = v.user_id and l.place_id = v.place_id
      where v.status = 'em_analise'
      order by v.comprovante_enviado_em;
end;
$$;

revoke all on function public.vendas_em_analise() from public, anon;
grant execute on function public.vendas_em_analise() to authenticated;

-- Aprova (vira "verificada", +40 pontos) ou recusa (vira "recusada",
-- perde os 10 pontos). Recusar exige um motivo, que o usuário vê.
create or replace function public.analisar_comprovante(
  p_venda_id bigint,
  p_aprovar boolean,
  p_motivo text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda public.vendas%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_status text;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  select * into v_venda from public.vendas where id = p_venda_id for update;
  if v_venda.id is null then
    raise exception 'Venda não encontrada.';
  end if;
  if v_venda.status <> 'em_analise' then
    raise exception 'Esta venda não está em análise (situação atual: %).', v_venda.status;
  end if;
  if char_length(v_motivo) > 500 then
    raise exception 'O motivo pode ter no máximo 500 caracteres.';
  end if;

  if p_aprovar then
    if exists (
      select 1 from public.vendas
      where place_id = v_venda.place_id and status = 'verificada' and id <> v_venda.id
    ) then
      raise exception 'Esta empresa já tem uma venda verificada por outra conta.';
    end if;
    v_status := 'verificada';
  else
    if v_motivo is null then
      raise exception 'Explique o motivo da recusa (o usuário vai ver).';
    end if;
    v_status := 'recusada';
  end if;

  update public.vendas
    set status = v_status,
        motivo_verificacao = case when p_aprovar then null else v_motivo end,
        analisado_em = now()
    where id = v_venda.id;

  insert into public.verificacoes_venda (venda_id, user_id, origem, resultado, site_testado, motivo)
  values (v_venda.id, v_venda.user_id, 'manual',
          case when p_aprovar then 'aprovada' else 'recusada' end,
          v_venda.site_url, v_motivo);

  return v_status;
end;
$$;

revoke all on function public.analisar_comprovante(bigint, boolean, text) from public, anon;
grant execute on function public.analisar_comprovante(bigint, boolean, text) to authenticated;

-- 11. Score do usuário -------------------------------------------------------
-- Tudo lido do banco; o usuário só dispara a leitura.
create or replace function public.meu_score()
returns table (
  pontos integer,
  vendas_verificadas integer,
  vendas_pendentes integer,
  vendas_recusadas integer,
  verificacoes_no_mes integer,
  limite_verificacoes integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  return query
    select coalesce(sum(v.pontos), 0)::int,
           (count(*) filter (where v.status = 'verificada'))::int,
           (count(*) filter (where v.status not in ('verificada', 'recusada')))::int,
           (count(*) filter (where v.status = 'recusada'))::int,
           (select count(*)::int from public.verificacoes_venda vv
             where vv.user_id = auth.uid() and vv.origem = 'automatica'
               and vv.criado_em >= public.inicio_do_mes(public.mes_brasilia())),
           public.limite_verificacoes_mes()
      from public.vendas v
      where v.user_id = auth.uid();
end;
$$;

revoke all on function public.meu_score() from public, anon;
grant execute on function public.meu_score() to authenticated;

-- Avisa a API do Supabase (PostgREST) para reler tabelas e funções.
notify pgrst, 'reload schema';
