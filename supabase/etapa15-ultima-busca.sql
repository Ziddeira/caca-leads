-- Ártemis Prospect — Etapa 15: a última busca fica salva
-- Rode isto DEPOIS das etapas anteriores, inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Antes, o resultado da busca vivia só na memória da página: bastava ir
-- para outra aba e voltar para ele sumir, mesmo já tendo sido cobrado.
-- Agora a última busca de cada usuário fica guardada aqui e a página
-- Buscar lê daqui. Ler NÃO gasta busca nem chama o Google.
--
-- Nada aqui mexe em planos, créditos, buscas ou cobrança. O navegador
-- não lê nem escreve direto nesta tabela: tudo passa pelas três funções
-- abaixo, que usam sempre o usuário logado (auth.uid()).
--
-- Política de cache da Google Maps Platform: o place_id pode ser
-- guardado para sempre; o conteúdo vindo do Google (nome, nota, bairro...)
-- só pode ficar em cache temporário, no máximo 30 dias corridos. Por
-- isso a lista de leads é apagada 30 dias depois da busca; ficam só os
-- termos e regiões que o próprio usuário digitou e a data, para a tela
-- avisar que a busca expirou. Mantenha o prazo igual ao de
-- VALIDADE_CACHE_DIAS em lib/leads/dadosLead.ts.
--
-- Os dados de contato (telefone, WhatsApp, site) NUNCA são guardados
-- aqui: na hora de mostrar, vêm do desbloqueio (leads_desbloqueados).

-- 1. Tabela ------------------------------------------------------------------
-- Uma linha por usuário: uma busca nova substitui a anterior.
--   leads: lista de leads da busca (sem contato). Nulo = expirou.
--   total_leads: quantos leads a busca trouxe (continua depois de expirar).
--   aviso: aviso da busca (ex.: "a busca parou antes do fim").
create table if not exists public.ultima_busca (
  user_id uuid primary key references auth.users (id) on delete cascade,
  termos text[] not null,
  areas text[] not null,
  modo text not null check (modo in ('negocios', 'hospedagem')),
  leads jsonb,
  total_leads integer not null default 0,
  aviso text,
  feita_em timestamptz not null default now(),
  expira_em timestamptz not null
);

-- RLS ligado e nenhuma política nem GRANT: ninguém lê ou escreve direto.
alter table public.ultima_busca enable row level security;
revoke all on public.ultima_busca from anon, authenticated;

-- 2. Função "salvar_ultima_busca" ---------------------------------------------
-- Chamada pelo servidor logo depois de uma busca (já cobrada). Substitui
-- a busca anterior do próprio usuário e aproveita para apagar a lista de
-- leads de buscas vencidas (mais de 30 dias) de todo mundo.
create or replace function public.salvar_ultima_busca(
  p_termos text[],
  p_areas text[],
  p_modo text,
  p_leads jsonb,
  p_aviso text
)
returns table (feita_em timestamptz, expira_em timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_agora timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;
  if p_leads is null or jsonb_typeof(p_leads) <> 'array' then
    raise exception 'Lista de leads inválida.';
  end if;

  insert into public.ultima_busca as u
    (user_id, termos, areas, modo, leads, total_leads, aviso, feita_em, expira_em)
  values (
    auth.uid(),
    coalesce(p_termos, '{}'),
    coalesce(p_areas, '{}'),
    case when p_modo = 'hospedagem' then 'hospedagem' else 'negocios' end,
    p_leads,
    jsonb_array_length(p_leads),
    left(p_aviso, 500),
    v_agora,
    v_agora + interval '30 days'
  )
  on conflict (user_id) do update
    set termos = excluded.termos,
        areas = excluded.areas,
        modo = excluded.modo,
        leads = excluded.leads,
        total_leads = excluded.total_leads,
        aviso = excluded.aviso,
        feita_em = excluded.feita_em,
        expira_em = excluded.expira_em;

  update public.ultima_busca u
    set leads = null
    where u.leads is not null
      and u.expira_em <= v_agora;

  return query select v_agora, v_agora + interval '30 days';
end;
$$;

revoke execute on function public.salvar_ultima_busca(text[], text[], text, jsonb, text) from public, anon;
grant execute on function public.salvar_ultima_busca(text[], text[], text, jsonb, text) to authenticated;

-- 3. Função "minha_ultima_busca" ----------------------------------------------
-- Devolve a última busca do usuário logado. Se já passou do prazo, apaga
-- a lista de leads ANTES de devolver (volta com leads = nulo, e a tela
-- mostra "esta busca expirou"). Só lê o banco: não gasta busca e não
-- chama o Google.
create or replace function public.minha_ultima_busca()
returns table (
  termos text[],
  areas text[],
  modo text,
  leads jsonb,
  total_leads integer,
  aviso text,
  feita_em timestamptz,
  expira_em timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  update public.ultima_busca u
    set leads = null
    where u.user_id = auth.uid()
      and u.leads is not null
      and u.expira_em <= now();

  return query
    select u.termos, u.areas, u.modo, u.leads, u.total_leads, u.aviso, u.feita_em, u.expira_em
    from public.ultima_busca u
    where u.user_id = auth.uid();
end;
$$;

revoke execute on function public.minha_ultima_busca() from public, anon;
grant execute on function public.minha_ultima_busca() to authenticated;

-- 4. Função "limpar_ultima_busca" ---------------------------------------------
-- Botão "Limpar pesquisa": apaga a última busca do usuário logado. Os
-- leads já desbloqueados continuam em "Meus leads" (outra tabela).
create or replace function public.limpar_ultima_busca()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  delete from public.ultima_busca where user_id = auth.uid();
end;
$$;

revoke execute on function public.limpar_ultima_busca() from public, anon;
grant execute on function public.limpar_ultima_busca() to authenticated;

-- Opcional: se a extensão pg_cron estiver ativa (Database > Extensions),
-- isto apaga as listas vencidas todo dia às 3h10, mesmo sem ninguém usar
-- o app. Descomente e rode:
-- select cron.schedule(
--   'limpar-ultima-busca',
--   '10 3 * * *',
--   $$update public.ultima_busca
--       set leads = null
--     where leads is not null and expira_em <= now()$$
-- );
