-- Ártemis Prospect — Etapa 9 (parte 1 de 2): central de notificações
-- Rode isto DEPOIS de todos os scripts anteriores (até a etapa 8),
-- inteiro, de uma vez: Supabase > SQL Editor > New query > cole tudo > Run.
-- Depois rode a parte 2 (etapa9-2-rotina-notificacoes.sql).
--
-- Regras desta etapa:
--   * notificação só nasce no servidor, pela rotina agendada (parte 2);
--   * o usuário só LÊ as próprias notificações. Marcar como lida e apagar
--     passam por funções deste arquivo, que mexem só em "lida_em" ou
--     apagam a linha — nunca no título, no texto ou no link;
--   * as novidades do site são escritas por você, na tabela "novidades".

-- 1. Tabela "notificacoes" --------------------------------------------------
-- Uma linha por aviso mostrado no sino.
-- tipo: renovacao | saldo | novidade | incentivo (só para organizar).
-- link: página do painel que o aviso abre (sempre um caminho interno,
-- começando com "/painel/", para nunca levar a um site de fora).
create table if not exists public.notificacoes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('renovacao', 'saldo', 'novidade', 'incentivo')),
  titulo text not null check (char_length(titulo) between 1 and 120),
  texto text not null check (char_length(texto) between 1 and 600),
  link text check (link is null or link ~ '^/painel(/[a-z0-9-]+)*$'),
  criado_em timestamptz not null default now(),
  lida_em timestamptz
);

create index if not exists notificacoes_user_criado_em_idx
  on public.notificacoes (user_id, criado_em desc);
create index if not exists notificacoes_nao_lidas_idx
  on public.notificacoes (user_id) where lida_em is null;

alter table public.notificacoes enable row level security;

grant usage on schema public to authenticated;
grant select on public.notificacoes to authenticated;
-- Cinto de segurança: mesmo que algum GRANT amplo seja aplicado por
-- engano no futuro, o navegador não cria nem altera notificação.
revoke insert, update, delete on public.notificacoes from authenticated, anon;

drop policy if exists "Usuários veem as próprias notificações" on public.notificacoes;
create policy "Usuários veem as próprias notificações"
  on public.notificacoes
  for select
  to authenticated
  using (user_id = auth.uid());

-- 2. Tabela "notificacoes_enviadas" (controle de repetição) -----------------
-- Cada aviso gerado deixa aqui uma "chave" (ex.: 'saldo-buscas:2026-10-05'
-- = aviso de buscas do ciclo que termina em 05/10). A rotina nunca gera
-- duas vezes a mesma chave para o mesmo usuário. Fica separada de
-- "notificacoes" de propósito: se o usuário APAGAR o aviso, a chave
-- continua aqui e o aviso não volta no dia seguinte.
create table if not exists public.notificacoes_enviadas (
  user_id uuid not null references auth.users (id) on delete cascade,
  chave text not null,
  criado_em timestamptz not null default now(),
  primary key (user_id, chave)
);

create index if not exists notificacoes_enviadas_criado_em_idx
  on public.notificacoes_enviadas (criado_em);

alter table public.notificacoes_enviadas enable row level security;
-- Sem GRANT para o usuário: só a rotina (parte 2) lê e escreve aqui.

-- 3. Tabela "novidades" (escrita por você) ----------------------------------
-- Cada linha vira uma notificação para todos os usuários na próxima
-- rodada da rotina (ou na hora, se você rodar "select public.gerar_notificacoes();").
--   titulo: curto, até 120 letras.
--   texto: até 600 letras.
--   publicar_em: a data do aviso. Só aparece a partir desse dia (dá para
--                agendar para o futuro). Quem criou a conta DEPOIS dessa
--                data não recebe (novidade velha não interessa a quem
--                acabou de chegar). Avisos com mais de 30 dias não são
--                mais enviados.
--   link: opcional, uma página do painel, ex.: '/painel/buscar'.
create table if not exists public.novidades (
  id bigint generated always as identity primary key,
  titulo text not null check (char_length(titulo) between 1 and 120),
  texto text not null check (char_length(texto) between 1 and 600),
  publicar_em date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  link text check (link is null or link ~ '^/painel(/[a-z0-9-]+)*$'),
  criado_em timestamptz not null default now()
);

alter table public.novidades enable row level security;
-- Sem GRANT para o usuário: ele recebe a novidade pelo sino, nunca lê
-- ou escreve esta tabela. Você escreve pelo SQL Editor ou Table Editor.

-- 4. Funções do usuário: marcar como lida e apagar --------------------------
-- Todas só mexem nas notificações do próprio usuário (auth.uid()).

-- Marca como lidas. Sem lista de ids = todas as não lidas.
-- Devolve quantas foram marcadas.
create or replace function public.marcar_notificacoes_lidas(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  if auth.uid() is null then
    raise exception 'Faça login para continuar.';
  end if;

  update public.notificacoes
    set lida_em = now()
    where user_id = auth.uid()
      and lida_em is null
      and (p_ids is null or id = any (p_ids));
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke all on function public.marcar_notificacoes_lidas(bigint[]) from public, anon;
grant execute on function public.marcar_notificacoes_lidas(bigint[]) to authenticated;

-- Apaga notificações. Sem lista de ids = apaga todas do usuário.
-- Devolve quantas foram apagadas.
create or replace function public.apagar_notificacoes(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  if auth.uid() is null then
    raise exception 'Faça login para continuar.';
  end if;

  delete from public.notificacoes
    where user_id = auth.uid()
      and (p_ids is null or id = any (p_ids));
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke all on function public.apagar_notificacoes(bigint[]) from public, anon;
grant execute on function public.apagar_notificacoes(bigint[]) to authenticated;
