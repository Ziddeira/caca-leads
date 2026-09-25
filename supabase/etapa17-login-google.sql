-- Ártemis Prospect — Etapa 17: login com o Google
-- Rode isto DEPOIS da etapa 16, inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- O login com o Google em si não precisa de SQL: quem entra pela primeira
-- vez ganha uma linha nova em auth.users e o gatilho "on_auth_user_created"
-- (etapas 1 e 5) já cria o perfil com o plano grátis e o apelido padrão.
-- Quem já tinha conta com o mesmo e-mail continua com o MESMO usuário (o
-- Supabase só acrescenta o Google como mais uma forma de entrar).
--
-- Este script só cria uma função de leitura para o Perfil saber se a
-- pessoa tem senha. Sem ela, o site descobre pelo tipo de login (e-mail ou
-- Google), o que falha num caso: quem entrou pelo Google e depois criou
-- uma senha pelo "Esqueci minha senha".

-- 1. Função "tem_senha" -----------------------------------------------------
-- Devolve true se o usuário logado tem senha cadastrada. Não devolve a
-- senha nem nada dela, só sim ou não. "security definer" porque a tabela
-- auth.users não é visível para o usuário.
create or replace function public.tem_senha()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.encrypted_password is not null and u.encrypted_password <> ''
       from auth.users u
       where u.id = auth.uid()),
    false
  );
$$;

revoke all on function public.tem_senha() from public, anon;
grant execute on function public.tem_senha() to authenticated;
