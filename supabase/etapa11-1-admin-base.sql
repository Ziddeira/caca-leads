-- Ártemis Prospect — Etapa 11, parte 1 de 3: permissão de administrador,
-- registro de erros e auditoria
-- Rode DEPOIS de todos os scripts anteriores (até a etapa 10), inteiro,
-- de uma vez: Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Regra desta etapa: quem é administrador é decidido SÓ pelo banco, pela
-- coluna profiles.is_admin. Nenhum e-mail fica escrito no código. Toda
-- função de administrador começa perguntando public.eh_admin(); as
-- tabelas novas têm RLS ligado e só administradores têm regra de leitura.

-- 1. Coluna "is_admin" em profiles ----------------------------------------
-- Começa falsa para todo mundo. Você marca a sua conta pelo SQL Editor
-- (veja o fim da parte 3). O usuário continua sem permissão de escrever
-- em profiles, então ninguém se promove pelo navegador.
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

revoke insert, update, delete on public.profiles from authenticated, anon;

-- Quem já estava na tabela "administradores" (etapa 8) vira is_admin.
-- A tabela antiga deixa de ser usada depois deste script.
do $$
begin
  if to_regclass('public.administradores') is not null then
    update public.profiles p
       set is_admin = true
      from public.administradores a
     where a.user_id = p.id
       and not p.is_admin;
  end if;
end;
$$;

-- Cinto de segurança extra: mesmo que alguma função futura, chamada por um
-- usuário logado, tente mudar is_admin, o banco recusa. Só muda pelo SQL
-- Editor (ou pelo servidor com a chave service_role), onde não há
-- usuário logado (auth.uid() é nulo).
create or replace function public.proteger_is_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin and auth.uid() is not null then
    raise exception 'Só dá para mudar o administrador direto pelo Supabase.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_proteger_is_admin on public.profiles;
create trigger profiles_proteger_is_admin
  before update of is_admin on public.profiles
  for each row execute function public.proteger_is_admin();

-- 2. eh_admin(): agora lê profiles.is_admin --------------------------------
-- Mesma função da etapa 8 (a tela de vendas e o bucket de comprovantes já
-- usam ela), só que olhando a coluna nova.
create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.eh_admin() from public, anon;
grant execute on function public.eh_admin() to authenticated;

-- 3. Tabela "erros_servidor" ------------------------------------------------
-- Uma linha por falha das rotinas do servidor: webhook do Asaas,
-- verificação de vendas, busca, notificações. Quem grava é o servidor
-- (chave service_role), pela função registrar_erro_servidor abaixo.
create table if not exists public.erros_servidor (
  id bigint generated always as identity primary key,
  origem text not null check (origem ~ '^[a-z0-9_]{1,40}$'),
  mensagem text not null check (char_length(mensagem) between 1 and 2000),
  detalhe jsonb,
  user_id uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists erros_servidor_criado_em_idx
  on public.erros_servidor (criado_em desc);

alter table public.erros_servidor enable row level security;

grant usage on schema public to authenticated;
grant select on public.erros_servidor to authenticated;
revoke insert, update, delete on public.erros_servidor from authenticated, anon;

drop policy if exists "Administradores leem os erros" on public.erros_servidor;
create policy "Administradores leem os erros"
  on public.erros_servidor
  for select
  to authenticated
  using (public.eh_admin());

create or replace function public.registrar_erro_servidor(
  p_origem text,
  p_mensagem text,
  p_detalhe jsonb default null,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.erros_servidor (origem, mensagem, detalhe, user_id)
  values (
    coalesce(nullif(left(lower(regexp_replace(coalesce(p_origem, ''), '[^a-zA-Z0-9_]', '_', 'g')), 40), ''), 'outro'),
    coalesce(nullif(left(coalesce(p_mensagem, ''), 2000), ''), 'Erro sem mensagem'),
    p_detalhe,
    p_user_id
  );

  -- Faxina: erros com mais de 90 dias somem sozinhos.
  delete from public.erros_servidor where criado_em < now() - interval '90 days';
end;
$$;

revoke all on function public.registrar_erro_servidor(text, text, jsonb, uuid) from public, anon, authenticated;
grant usage on schema public to service_role;
grant execute on function public.registrar_erro_servidor(text, text, jsonb, uuid) to service_role;

-- 4. Tabela "admin_auditoria" -----------------------------------------------
-- Tudo que um administrador muda numa conta (saldo, plano), nos avisos
-- e nas vendas fica aqui: quem fez, em quem, quando, o antes e o depois.
-- Só as funções de administrador escrevem; ninguém apaga pelo site.
create table if not exists public.admin_auditoria (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  admin_email text,
  alvo_id uuid references auth.users (id) on delete set null,
  alvo_email text,
  acao text not null,
  antes jsonb,
  depois jsonb,
  motivo text,
  criado_em timestamptz not null default now()
);

create index if not exists admin_auditoria_criado_em_idx
  on public.admin_auditoria (criado_em desc);
create index if not exists admin_auditoria_alvo_idx
  on public.admin_auditoria (alvo_id, criado_em desc);

alter table public.admin_auditoria enable row level security;

grant select on public.admin_auditoria to authenticated;
revoke insert, update, delete on public.admin_auditoria from authenticated, anon;

drop policy if exists "Administradores leem a auditoria" on public.admin_auditoria;
create policy "Administradores leem a auditoria"
  on public.admin_auditoria
  for select
  to authenticated
  using (public.eh_admin());

-- Grava uma linha de auditoria em nome do administrador logado. Uso
-- interno: só as outras funções deste script chamam.
create or replace function public.registrar_auditoria(
  p_acao text,
  p_alvo uuid,
  p_antes jsonb,
  p_depois jsonb,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_auditoria (admin_id, admin_email, alvo_id, alvo_email, acao, antes, depois, motivo)
  values (
    auth.uid(),
    (select email from public.profiles where id = auth.uid()),
    p_alvo,
    (select email from public.profiles where id = p_alvo),
    p_acao,
    p_antes,
    p_depois,
    nullif(btrim(coalesce(p_motivo, '')), '')
  );
end;
$$;

revoke all on function public.registrar_auditoria(text, uuid, jsonb, jsonb, text) from public, anon, authenticated;

-- 5. Aprovar/recusar venda, agora com auditoria -----------------------------
-- Chama a função da etapa 8 (que já confere o administrador) e anota
-- quem decidiu.
create or replace function public.admin_analisar_comprovante(
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
  v_dono uuid;
  v_status text;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  select user_id into v_dono from public.vendas where id = p_venda_id;
  v_status := public.analisar_comprovante(p_venda_id, p_aprovar, p_motivo);

  perform public.registrar_auditoria(
    case when p_aprovar then 'venda_aprovada' else 'venda_recusada' end,
    v_dono,
    jsonb_build_object('venda_id', p_venda_id, 'status', 'em_analise'),
    jsonb_build_object('venda_id', p_venda_id, 'status', v_status),
    p_motivo
  );
  return v_status;
end;
$$;

revoke all on function public.admin_analisar_comprovante(bigint, boolean, text) from public, anon;
grant execute on function public.admin_analisar_comprovante(bigint, boolean, text) to authenticated;

notify pgrst, 'reload schema';
