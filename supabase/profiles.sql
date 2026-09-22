-- Caça-leads: tabela de perfis dos usuários
-- Cole este script inteiro no Supabase: SQL Editor > New query > Run

-- 1. Tabela profiles ---------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  plano text not null default 'gratis' check (plano in ('gratis', 'solo', 'pro')),
  creditos_desbloqueio integer not null default 5,
  buscas_restantes integer not null default 3,
  created_at timestamptz not null default now()
);

-- 2. Ativa o RLS (Row Level Security) -----------------------------------
alter table public.profiles enable row level security;

-- 3. Permissões (GRANT) --------------------------------------------------
-- A exposição automática de tabelas está desativada no projeto, então é
-- preciso liberar explicitamente o acesso para o papel "authenticated"
-- (usuários logados). O papel "anon" (visitante não logado) não recebe
-- nenhuma permissão nesta tabela.
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;

-- Nenhuma permissão de insert/update/delete é dada ao usuário: o perfil é
-- criado automaticamente pelo gatilho abaixo, e créditos/plano só devem
-- mudar por lógica do servidor (isso será feito em uma etapa futura, ao
-- implementar pagamentos).

-- 4. Regras de RLS --------------------------------------------------------
-- Cada usuário só pode ver o próprio perfil.
create policy "Usuários veem o próprio perfil"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- 5. Criação automática do perfil no cadastro -----------------------------
-- Função "security definer": roda com privilégios do dono (não do usuário),
-- por isso consegue inserir na tabela mesmo com o RLS ativado.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

-- Gatilho: toda vez que um usuário novo é criado em auth.users, chama a
-- função acima e cria a linha correspondente em public.profiles.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
