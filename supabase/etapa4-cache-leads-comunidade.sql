-- Ártemis Prospect — Etapa 4: cache dos leads desbloqueados e lista de espera
-- da Comunidade.
-- Rode isto DEPOIS da etapa 3, inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Nada aqui mexe em planos, créditos, buscas ou cobrança.

-- 1. Cache dos dados do lead desbloqueado ----------------------------------
-- Antes, a página "Meus leads" chamava o Google (Place Details) para CADA
-- lead toda vez que era aberta: lenta e cara. Agora os dados mostrados
-- ficam guardados junto do desbloqueio e a página lê só do banco.
--
-- Política de cache da Google Maps Platform (Termos Específicos da
-- Places API): o place_id pode ser guardado para sempre; o restante do
-- conteúdo só pode ficar em cache temporário. Por isso:
--   * "dados" guarda só o necessário para exibir o lead;
--   * "dados_atualizados_em" marca quando veio do Google;
--   * depois de 30 dias o cache é apagado (função abaixo) e o app busca
--     de novo no Google na próxima visita — uma vez, não a cada visita.
alter table public.leads_desbloqueados
  add column if not exists dados jsonb,
  add column if not exists dados_atualizados_em timestamptz;

-- O SELECT dessas colunas já está coberto pelo GRANT e pela política de
-- RLS da etapa 2 (cada usuário vê só as próprias linhas). Continua sem
-- GRANT de UPDATE: a única forma de gravar é pela função abaixo.

-- 2. Função "salvar_dados_lead" ---------------------------------------------
-- Grava o cache de UM lead que o próprio usuário já desbloqueou (se o
-- lead não é dele, não faz nada). Não toca em créditos. Aproveita para
-- apagar caches vencidos (mais de 30 dias) de todo mundo.
create or replace function public.salvar_dados_lead(p_place_id text, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  update public.leads_desbloqueados
    set dados = p_dados,
        dados_atualizados_em = now()
    where user_id = auth.uid()
      and place_id = p_place_id;

  update public.leads_desbloqueados
    set dados = null,
        dados_atualizados_em = null
    where dados_atualizados_em < now() - interval '30 days';
end;
$$;

revoke execute on function public.salvar_dados_lead(text, jsonb) from public, anon;
grant execute on function public.salvar_dados_lead(text, jsonb) to authenticated;

-- Opcional: se a extensão pg_cron estiver ativa (Database > Extensions),
-- isto apaga os caches vencidos todo dia às 3h, mesmo sem ninguém usar o
-- app. Descomente e rode:
-- select cron.schedule(
--   'limpar-cache-leads',
--   '0 3 * * *',
--   $$update public.leads_desbloqueados
--       set dados = null, dados_atualizados_em = null
--     where dados_atualizados_em < now() - interval '30 days'$$
-- );

-- 3. Lista de espera da Comunidade ------------------------------------------
-- Guarda só o clique em "Quero ser avisado": quem clicou e quando.
-- Nenhum e-mail é enviado por aqui.
create table if not exists public.interesse_comunidade (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

alter table public.interesse_comunidade enable row level security;

grant select on public.interesse_comunidade to authenticated;

drop policy if exists "Usuários veem o próprio interesse na comunidade"
  on public.interesse_comunidade;
create policy "Usuários veem o próprio interesse na comunidade"
  on public.interesse_comunidade
  for select
  to authenticated
  using (user_id = auth.uid());

-- Sem GRANT de insert: a gravação é só pela função abaixo, que usa sempre
-- o usuário logado (ninguém inscreve outra pessoa).
create or replace function public.quero_ser_avisado_comunidade()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  insert into public.interesse_comunidade (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;
end;
$$;

revoke execute on function public.quero_ser_avisado_comunidade() from public, anon;
grant execute on function public.quero_ser_avisado_comunidade() to authenticated;
