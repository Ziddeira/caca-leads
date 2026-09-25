-- Ártemis Prospect — Etapa 17: tema claro, escuro ou "seguir o sistema"
-- Rode isto DEPOIS da etapa 5, inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Nada aqui mexe em planos, créditos, buscas ou cobrança. O navegador
-- continua sem permissão de escrita direta em "profiles": trocar o tema
-- passa por uma função que só toca nessa coluna.

-- 1. Nova coluna em "profiles" --------------------------------------------
-- tema: 'claro', 'escuro' ou 'sistema' (segue o celular/computador).
--   Nulo = a pessoa nunca escolheu; o site usa o escuro (padrão).
alter table public.profiles
  add column if not exists tema text;

alter table public.profiles
  drop constraint if exists profiles_tema_valido;

alter table public.profiles
  add constraint profiles_tema_valido
  check (tema is null or tema in ('claro', 'escuro', 'sistema'));

-- 2. Função "definir_tema" --------------------------------------------------
-- Guarda a escolha da própria pessoa. Vale em qualquer aparelho em que
-- ela entrar.
create or replace function public.definir_tema(p_tema text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  if p_tema is null or p_tema not in ('claro', 'escuro', 'sistema') then
    raise exception 'Tema inválido.';
  end if;

  update public.profiles
    set tema = p_tema
    where id = auth.uid();
end;
$$;

revoke all on function public.definir_tema(text) from public, anon;
grant execute on function public.definir_tema(text) to authenticated;

-- 3. Reforço de segurança em "profiles" ---------------------------------------
-- O mesmo cinto de segurança das etapas anteriores, repetido porque esta
-- etapa adicionou coluna: o navegador só lê a própria linha e não
-- escreve nada direto.
revoke insert, update, delete on public.profiles from authenticated, anon;
