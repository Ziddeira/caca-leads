-- Ártemis Prospect — Etapa 2: busca no Google e desbloqueio de leads
-- Rode isto DEPOIS do supabase/profiles.sql, inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.

-- 1. Tabela "buscas" ------------------------------------------------------
-- Cada linha é 1 busca (1 termo × 1 região) já paga com o saldo do plano.
-- Serve de histórico e também de base para o limite de 10 buscas/minuto.
create table if not exists public.buscas (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  termo text not null,
  area text not null,
  modo text not null check (modo in ('negocios', 'hospedagem')),
  criado_em timestamptz not null default now()
);

create index if not exists buscas_user_criado_em_idx
  on public.buscas (user_id, criado_em desc);

alter table public.buscas enable row level security;

-- Ninguém recebe GRANT nesta tabela: ela só é escrita pela função
-- "iniciar_busca" abaixo (security definer, roda com privilégios do dono).
-- Sem GRANT, o RLS nem chega a ser avaliado para o usuário comum — é
-- bloqueio em duas camadas.

-- 2. Tabela "chamadas_google" ---------------------------------------------
-- Uma linha por chamada real à API do Google (cada página de busca de
-- texto e cada consulta de detalhes), para medir custo.
create table if not exists public.chamadas_google (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  tipo text not null check (tipo in ('places_text_search', 'place_details')),
  criado_em timestamptz not null default now()
);

create index if not exists chamadas_google_criado_em_idx
  on public.chamadas_google (criado_em desc);

alter table public.chamadas_google enable row level security;

grant usage on schema public to authenticated;
grant insert on public.chamadas_google to authenticated;

-- O usuário só pode registrar chamadas em nome dele mesmo (não pode
-- inflar ou forjar o registro de outra pessoa). Não há SELECT liberado
-- para o usuário: a leitura para medir custo é feita por você, direto
-- no SQL Editor ou no Table Editor do Supabase.
create policy "Usuários registram as próprias chamadas ao Google"
  on public.chamadas_google
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- 3. Tabela "leads_desbloqueados" ------------------------------------------
-- Política de cache da Google Maps Platform: place_id pode ficar guardado
-- para sempre; os demais dados (telefone, site, etc.) não são
-- armazenados aqui — são buscados de novo com Place Details quando
-- precisar mostrá-los (ver rotas da aplicação).
create table if not exists public.leads_desbloqueados (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  place_id text not null,
  desbloqueado_em timestamptz not null default now(),
  unique (user_id, place_id)
);

alter table public.leads_desbloqueados enable row level security;

grant select on public.leads_desbloqueados to authenticated;

create policy "Usuários veem os próprios leads desbloqueados"
  on public.leads_desbloqueados
  for select
  to authenticated
  using (user_id = auth.uid());

-- Sem GRANT de insert/update/delete para o usuário: a única forma de
-- entrar nesta tabela é pela função "desbloquear_lead" abaixo.

-- 4. Reforço de segurança em "profiles" ------------------------------------
-- profiles.sql já não concede insert/update/delete para "authenticated",
-- então o usuário não consegue mudar plano/créditos/buscas pelo
-- navegador. Este REVOKE é só um cinto de segurança extra, caso algum
-- GRANT amplo (ex.: "grant all") seja aplicado por engano no futuro.
revoke insert, update, delete on public.profiles from authenticated;

-- 5. Função "iniciar_busca" -------------------------------------------------
-- Chamada uma vez por busca (pode cobrir vários termos × várias regiões
-- de uma vez). Tudo dentro de uma transação:
--   1. confere se o modo "hospedagem" é permitido no plano do usuário;
--   2. confere se há saldo de buscas suficiente para o total pedido;
--   3. confere o limite de 10 buscas por minuto (olhando o histórico);
--   4. desconta o saldo e grava uma linha por busca, tudo ou nada.
-- "security definer" é obrigatório: o usuário comum não tem permissão de
-- UPDATE em profiles nem de INSERT em buscas, só esta função (dona do
-- dono do banco) consegue.
create or replace function public.iniciar_busca(
  p_termos text[],
  p_areas text[],
  p_modo text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plano text;
  v_buscas_restantes integer;
  v_total integer;
  v_recentes integer;
  v_termo text;
  v_area text;
begin
  if p_modo not in ('negocios', 'hospedagem') then
    raise exception 'Modo de busca inválido.';
  end if;

  if p_termos is null or array_length(p_termos, 1) is null then
    raise exception 'Digite ao menos um nicho.';
  end if;

  if p_areas is null or array_length(p_areas, 1) is null then
    raise exception 'Digite ao menos uma região.';
  end if;

  v_total := array_length(p_termos, 1) * array_length(p_areas, 1);

  -- Trava a linha do perfil até o fim da transação, para que duas
  -- buscas simultâneas do mesmo usuário nunca descontem por cima uma
  -- da outra (evita saldo negativo por corrida).
  select plano, buscas_restantes
    into v_plano, v_buscas_restantes
    from public.profiles
    where id = auth.uid()
    for update;

  if v_plano is null then
    raise exception 'Perfil não encontrado.';
  end if;

  if p_modo = 'hospedagem' and v_plano <> 'pro' then
    raise exception 'O modo Hospedagem é exclusivo do plano Pro.';
  end if;

  if v_buscas_restantes < v_total then
    raise exception
      'Saldo de buscas insuficiente: restam % e essa busca gastaria %.',
      v_buscas_restantes, v_total;
  end if;

  select count(*)
    into v_recentes
    from public.buscas
    where user_id = auth.uid()
      and criado_em > now() - interval '1 minute';

  if v_recentes + v_total > 10 then
    raise exception
      'Limite de 10 buscas por minuto atingido (% no último minuto, essa busca pediria mais %). Aguarde um pouco e tente de novo.',
      v_recentes, v_total;
  end if;

  update public.profiles
    set buscas_restantes = buscas_restantes - v_total
    where id = auth.uid();

  foreach v_termo in array p_termos loop
    foreach v_area in array p_areas loop
      insert into public.buscas (user_id, termo, area, modo)
      values (auth.uid(), v_termo, v_area, p_modo);
    end loop;
  end loop;

  return v_buscas_restantes - v_total;
end;
$$;

grant execute on function public.iniciar_busca(text[], text[], text) to authenticated;

-- 6. Função "desbloquear_lead" ----------------------------------------------
-- Desconta 1 crédito e registra o place_id como desbloqueado. Se o lead
-- já tinha sido desbloqueado antes pelo mesmo usuário, não cobra de
-- novo (idempotente) — só confirma que já está liberado.
create or replace function public.desbloquear_lead(p_place_id text)
returns table (ja_desbloqueado boolean, creditos_restantes integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creditos integer;
  v_existe boolean;
begin
  if p_place_id is null or length(trim(p_place_id)) = 0 then
    raise exception 'place_id inválido.';
  end if;

  select creditos_desbloqueio
    into v_creditos
    from public.profiles
    where id = auth.uid()
    for update;

  if v_creditos is null then
    raise exception 'Perfil não encontrado.';
  end if;

  select exists(
    select 1 from public.leads_desbloqueados
    where user_id = auth.uid() and place_id = p_place_id
  ) into v_existe;

  if v_existe then
    return query select true, v_creditos;
    return;
  end if;

  if v_creditos < 1 then
    raise exception 'Você não tem créditos de desbloqueio disponíveis.';
  end if;

  update public.profiles
    set creditos_desbloqueio = creditos_desbloqueio - 1
    where id = auth.uid();

  insert into public.leads_desbloqueados (user_id, place_id)
  values (auth.uid(), p_place_id);

  return query select false, v_creditos - 1;
end;
$$;

grant execute on function public.desbloquear_lead(text) to authenticated;
