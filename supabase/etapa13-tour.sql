-- Ártemis Prospect — Etapa 13: tour guiado pela Ártemis no primeiro acesso
-- Rode isto DEPOIS da etapa 6, inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Nada aqui mexe em planos, créditos, buscas ou cobrança. O navegador
-- continua sem permissão de escrita direta em "profiles": marcar o tour
-- como visto passa por uma função que só toca nessa coluna.

-- 1. Nova coluna em "profiles" --------------------------------------------
-- tour_concluido_em: quando a pessoa terminou (ou pulou) o tour guiado.
--   Nulo = ainda não viu o tour.
--
-- Quem JÁ usava o sistema antes desta etapa (já passou pela tela de
-- boas-vindas) não vê o tour sozinho; pode rever quando quiser no Perfil.
-- Por isso, só na hora em que a coluna é criada, essas contas são
-- marcadas como concluídas. Contas novas (ou que ainda não passaram
-- pelas boas-vindas) ficam com nulo e veem o tour. Rodar o script de
-- novo não marca ninguém.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'tour_concluido_em'
  ) then
    alter table public.profiles add column tour_concluido_em timestamptz;
    update public.profiles
      set tour_concluido_em = now()
      where configuracao_inicial_em is not null;
  end if;
end;
$$;

-- 2. Função "concluir_tour" -------------------------------------------------
-- Chamada ao terminar OU pular o tour. Guarda só a primeira vez: rever o
-- tour pelo Perfil não muda a data.
create or replace function public.concluir_tour()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  update public.profiles
    set tour_concluido_em = coalesce(tour_concluido_em, now())
    where id = auth.uid();
end;
$$;

revoke all on function public.concluir_tour() from public, anon;
grant execute on function public.concluir_tour() to authenticated;

-- 3. Reforço de segurança em "profiles" ---------------------------------------
-- O mesmo cinto de segurança das etapas anteriores, repetido porque esta
-- etapa adicionou coluna: o navegador só lê a própria linha e não
-- escreve nada direto.
revoke insert, update, delete on public.profiles from authenticated, anon;
