-- Ártemis Prospect — Etapa 8, parte 1 de 3: mês, regras, pontos e verificação automática
-- Rode DEPOIS da etapa 7, inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Dica: copie pelo botão "Copy raw file" do GitHub (ou abra o arquivo
-- no editor e use Ctrl+A). Se a cópia vier cortada, o Supabase acusa
-- erro de sintaxe numa linha do meio, como "syntax error at or near".

-- Como a segurança funciona nesta etapa:
--   * o navegador continua SEM permissão de escrever em "vendas": status,
--     pontos, tentativas e comprovante só mudam por funções do banco;
--   * PONTOS nunca são gravados por ninguém: um gatilho calcula a partir
--     do status da venda (10 pendente, 50 verificada, 0 recusada);
--   * a verificação automática roda no servidor (rota agendada da Vercel,
--     com a chave service_role). As funções que gravam o resultado e que
--     fecham o mês só podem ser chamadas pelo papel "service_role";
--   * aprovar/recusar comprovante só funciona para quem está na tabela
--     "administradores" — conferido aqui no banco, não só na tela;
--   * o rank público mostra só apelido, avatar e número de vendas
--     verificadas. Nunca valor em reais, nome real ou e-mail.
--
-- Mexe em créditos SÓ num ponto: o prêmio do mês soma "creditos_premio"
-- (uma coluna nova, separada dos créditos do plano). Não dá buscas.


-- 1. Funções de mês (sempre no horário de Brasília) --------------------------
-- mes_brasilia(): primeiro dia do mês em que um instante cai, em Brasília.
-- inicio_do_mes(): o instante exato (meia-noite de Brasília) em que um mês
-- começa. Usadas pelo limite mensal e pelo rank.
-- primeiro_dia(): 2026-09-17 → 2026-09-01.
create or replace function public.primeiro_dia(p_data date)
returns date
language sql
immutable
as $$
  select p_data - (extract(day from p_data)::int - 1);
$$;

create or replace function public.mes_brasilia(p_ts timestamptz default now())
returns date
language sql
stable
as $$
  select date_trunc('month', p_ts at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function public.inicio_do_mes(p_mes date)
returns timestamptz
language sql
stable
as $$
  select public.primeiro_dia(p_mes)::timestamp at time zone 'America/Sao_Paulo';
$$;

-- 2. Regras numéricas (um lugar só para mudar) ------------------------------
-- Mantenha iguais às de lib/vendas/regras.ts (que só serve para a tela).
create or replace function public.pontos_por_status(p_status text)
returns integer
language sql
immutable
as $$
  -- 10 ao marcar como fechado; +40 quando verificada (total 50);
  -- recusada perde os 10.
  select case p_status when 'verificada' then 50 when 'recusada' then 0 else 10 end;
$$;

-- Verificações automáticas por usuário por mês (custo controlado).
create or replace function public.limite_verificacoes_mes()
returns integer
language sql
immutable
as $$ select 30 $$;

-- Depois de tantas tentativas automáticas sem sucesso, a venda para de ser
-- tentada sozinha (continua podendo ir por comprovante).
create or replace function public.max_tentativas_automaticas()
returns integer
language sql
immutable
as $$ select 8 $$;

-- A partir de quantas tentativas o usuário pode mandar comprovante.
create or replace function public.tentativas_para_comprovante()
returns integer
language sql
immutable
as $$ select 3 $$;

-- 3. Novas colunas e novos status em "vendas" --------------------------------
-- status:
--   pendente_verificacao → acabou de ser registrada (ou teve o endereço
--                          corrigido); espera a próxima rodada semanal.
--   aguardando_google    → site no ar e com domínio próprio, mas o Google
--                          Maps da empresa ainda não aponta para ele.
--   nao_verificada       → o site não abriu ou não é domínio próprio.
--   em_analise           → o usuário mandou comprovante; espera você.
--   verificada           → confirmada (automática ou pelo comprovante).
--   recusada             → você recusou o comprovante. Final.
-- tentativas: quantas verificações automáticas já rodaram nesta venda.
-- ultima_verificacao_em: quando rodou a última (garante 1 por semana).
alter table public.vendas
  add column if not exists tentativas integer not null default 0,
  add column if not exists ultima_verificacao_em timestamptz,
  add column if not exists comprovante_path text,
  add column if not exists comprovante_enviado_em timestamptz,
  add column if not exists analisado_em timestamptz;

alter table public.vendas drop constraint if exists vendas_status_valido;
alter table public.vendas add constraint vendas_status_valido check (
  status in (
    'pendente_verificacao', 'aguardando_google', 'nao_verificada',
    'em_analise', 'verificada', 'recusada'
  )
);

-- Uma empresa (place_id) só pode ter UMA venda verificada, de um único
-- usuário: dois usuários não ganham pontos pelo mesmo cliente.
create unique index if not exists vendas_uma_verificada_por_empresa
  on public.vendas (place_id) where status = 'verificada';

create index if not exists vendas_verificacao_idx
  on public.vendas (status, ultima_verificacao_em);
create index if not exists vendas_rank_idx
  on public.vendas (verificado_em) where status = 'verificada';

-- 4. Pontos calculados pelo banco --------------------------------------------
-- Toda vez que uma venda nasce ou muda, este gatilho recalcula pontos e
-- os campos "verificado" / "verificado_em" a partir do status. Nenhuma
-- função (nem o servidor) escreve pontos na mão.
create or replace function public.calcular_pontos_venda()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.pontos := public.pontos_por_status(new.status);
  new.verificado := case
    when new.status = 'verificada' then true
    when new.status = 'recusada' then false
    else null
  end;
  if new.status = 'verificada' then
    if tg_op = 'INSERT' or old.status is distinct from 'verificada' then
      new.verificado_em := now();
    end if;
  else
    new.verificado_em := null;
  end if;
  return new;
end;
$$;

revoke all on function public.calcular_pontos_venda() from public, anon, authenticated;

-- O nome começa com "vendas_pontos" para rodar ANTES da trava abaixo
-- (o Postgres executa os gatilhos em ordem alfabética).
drop trigger if exists vendas_pontos_calcular on public.vendas;
create trigger vendas_pontos_calcular
  before insert or update on public.vendas
  for each row execute function public.calcular_pontos_venda();

-- Trava (substitui a da etapa 7): escrita vinda direto do navegador
-- (papéis "authenticated"/"anon") é recusada por inteiro. As funções
-- abaixo rodam como dono do banco e passam normalmente.
create or replace function public.proteger_verificacao_venda()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'As vendas só podem ser alteradas pelo sistema.';
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_verificacao_venda() from public, anon, authenticated;

-- Vendas que já existiam: 10 pontos (pendentes). O gatilho acima calcula.
update public.vendas
  set pontos = public.pontos_por_status(status)
  where pontos is distinct from public.pontos_por_status(status);

-- 5. Registro de cada verificação --------------------------------------------
-- Uma linha por verificação (automática ou análise manual). Serve para o
-- limite mensal por usuário e para você auditar. Ninguém recebe GRANT:
-- só as funções do banco escrevem, e você lê no SQL Editor.
create table if not exists public.verificacoes_venda (
  id bigint generated always as identity primary key,
  venda_id bigint not null references public.vendas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  origem text not null check (origem in ('automatica', 'manual')),
  resultado text not null check (resultado in (
    'verificada', 'aguardando_google', 'nao_verificada', 'erro_temporario',
    'aprovada', 'recusada'
  )),
  site_testado text,
  site_no_ar boolean,
  dominio_proprio boolean,
  google_confere boolean,
  motivo text,
  criado_em timestamptz not null default now()
);

create index if not exists verificacoes_venda_user_criado_idx
  on public.verificacoes_venda (user_id, criado_em desc);

alter table public.verificacoes_venda enable row level security;
revoke all on public.verificacoes_venda from anon, authenticated;

-- A tabela "chamadas_google" (etapa 2) passa a aceitar o tipo das
-- consultas feitas pela verificação, para medir o custo separado.
alter table public.chamadas_google drop constraint if exists chamadas_google_tipo_check;
alter table public.chamadas_google add constraint chamadas_google_tipo_check check (
  tipo in ('places_text_search', 'place_details', 'verificacao_venda')
);

-- 6. Lote semanal: quais vendas verificar ------------------------------------
-- Chamada pela rota agendada (service_role). Escolhe até p_limite vendas
-- que:
--   * ainda não estão resolvidas (pendente, aguardando Google, não verificada);
--   * não passaram do máximo de tentativas automáticas;
--   * não foram verificadas nos últimos 6 dias (1 vez por semana, mesmo
--     que a rota rode duas vezes);
--   * cujo dono ainda não atingiu o limite de verificações do mês.
-- Já marca "ultima_verificacao_em" nelas (reserva), para duas rodadas
-- simultâneas não pegarem a mesma venda.
create or replace function public.vendas_para_verificar(p_limite integer)
returns table (
  venda_id bigint,
  user_id uuid,
  place_id text,
  site_url text,
  nome_empresa text,
  tentativas integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio timestamptz := public.inicio_do_mes(public.mes_brasilia());
begin
  return query
  with usados as (
    select vv.user_id, count(*)::int as n
      from public.verificacoes_venda vv
      where vv.origem = 'automatica' and vv.criado_em >= v_inicio
      group by vv.user_id
  ),
  candidatas as (
    select v.id,
           row_number() over (
             partition by v.user_id
             order by v.ultima_verificacao_em nulls first, v.id
           ) as ordem_no_usuario,
           coalesce(u.n, 0) as usados_no_mes,
           v.ultima_verificacao_em as ultima
      from public.vendas v
      left join usados u on u.user_id = v.user_id
      where v.status in ('pendente_verificacao', 'aguardando_google', 'nao_verificada')
        and v.tentativas < public.max_tentativas_automaticas()
        and (v.ultima_verificacao_em is null or v.ultima_verificacao_em < now() - interval '6 days')
  ),
  escolhidas as (
    select c.id
      from candidatas c
      where c.usados_no_mes + c.ordem_no_usuario <= public.limite_verificacoes_mes()
      order by c.ultima nulls first, c.id
      limit greatest(p_limite, 0)
  ),
  reservadas as (
    update public.vendas v
      set ultima_verificacao_em = now()
      from escolhidas e
      where v.id = e.id
      returning v.id, v.user_id, v.place_id, v.site_url, v.tentativas
  )
  select r.id, r.user_id, r.place_id, r.site_url,
         (to_jsonb(l) -> 'dados' ->> 'nome'),
         r.tentativas
    from reservadas r
    left join public.leads_desbloqueados l
      on l.user_id = r.user_id and l.place_id = r.place_id;
end;
$$;

revoke all on function public.vendas_para_verificar(integer) from public, anon, authenticated;
grant execute on function public.vendas_para_verificar(integer) to service_role;

-- 7. Grava o resultado de uma verificação automática -------------------------
-- p_resultado: 'verificada', 'aguardando_google', 'nao_verificada' ou
-- 'erro_temporario' (o Google ou a rede falharam do nosso lado — não
-- conta tentativa e não muda nada na venda).
-- p_chamou_google: true se a verificação consultou o Google Maps; vira
-- uma linha em "chamadas_google" (tipo 'verificacao_venda').
-- Devolve o status final da venda (ou 'ignorada').
create or replace function public.registrar_verificacao_venda(
  p_venda_id bigint,
  p_resultado text,
  p_site_testado text,
  p_site_no_ar boolean,
  p_dominio_proprio boolean,
  p_google_confere boolean,
  p_motivo text,
  p_chamou_google boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda public.vendas%rowtype;
  v_resultado text := p_resultado;
  v_motivo text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 500);
begin
  if p_resultado not in ('verificada', 'aguardando_google', 'nao_verificada', 'erro_temporario') then
    raise exception 'Resultado de verificação inválido.';
  end if;

  select * into v_venda from public.vendas where id = p_venda_id for update;
  if v_venda.id is null then
    return 'ignorada';
  end if;

  -- A chamada ao Google aconteceu de qualquer jeito: registra o custo.
  if p_chamou_google then
    insert into public.chamadas_google (user_id, tipo)
    values (v_venda.user_id, 'verificacao_venda');
  end if;

  -- Enquanto a verificação rodava, o usuário corrigiu o endereço ou mandou
  -- comprovante: este resultado não vale mais.
  if v_venda.status not in ('pendente_verificacao', 'aguardando_google', 'nao_verificada')
    or v_venda.site_url is distinct from p_site_testado then
    return 'ignorada';
  end if;

  -- Outra venda da mesma empresa já foi verificada (de outro usuário).
  if v_resultado = 'verificada' and exists (
    select 1 from public.vendas
    where place_id = v_venda.place_id and status = 'verificada' and id <> v_venda.id
  ) then
    v_resultado := 'nao_verificada';
    v_motivo := 'Esta empresa já tem uma venda verificada por outra conta. Cada cliente só vale para uma venda.';
  end if;

  insert into public.verificacoes_venda (
    venda_id, user_id, origem, resultado, site_testado,
    site_no_ar, dominio_proprio, google_confere, motivo
  ) values (
    v_venda.id, v_venda.user_id, 'automatica', v_resultado, p_site_testado,
    p_site_no_ar, p_dominio_proprio, p_google_confere, v_motivo
  );

  if v_resultado = 'erro_temporario' then
    return v_venda.status;
  end if;

  update public.vendas
    set status = v_resultado,
        motivo_verificacao = case when v_resultado = 'verificada' then null else v_motivo end,
        tentativas = tentativas + 1,
        ultima_verificacao_em = now()
    where id = v_venda.id;

  return v_resultado;
end;
$$;

revoke all on function public.registrar_verificacao_venda(bigint, text, text, boolean, boolean, boolean, text, boolean)
  from public, anon, authenticated;
grant execute on function public.registrar_verificacao_venda(bigint, text, text, boolean, boolean, boolean, text, boolean)
  to service_role;

-- 8. O usuário corrige o endereço do site ------------------------------------
-- Só enquanto a venda não está resolvida nem em análise. Volta para
-- "pendente" e entra na próxima rodada semanal. As tentativas NÃO zeram.
create or replace function public.corrigir_site_venda(p_place_id text, p_site_url text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda public.vendas%rowtype;
  v_site text := btrim(coalesce(p_site_url, ''));
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  select * into v_venda from public.vendas
    where user_id = auth.uid() and place_id = p_place_id
    for update;

  if v_venda.id is null then
    raise exception 'Venda não encontrada.';
  end if;

  if v_venda.status not in ('pendente_verificacao', 'aguardando_google', 'nao_verificada') then
    raise exception 'O endereço desta venda não pode mais ser alterado.';
  end if;

  if v_site = '' then
    raise exception 'Informe o endereço do site entregue.';
  end if;
  if v_site !~* '^https?://' then
    v_site := 'https://' || v_site;
  end if;
  if char_length(v_site) > 500
    or v_site !~* '^https?://[^[:space:]/]+\.[^[:space:]]+$' then
    raise exception 'Endereço do site inválido. Exemplo: https://www.seucliente.com.br';
  end if;

  update public.vendas
    set site_url = v_site,
        status = 'pendente_verificacao',
        motivo_verificacao = null,
        ultima_verificacao_em = null
    where id = v_venda.id;

  return v_site;
end;
$$;

revoke all on function public.corrigir_site_venda(text, text) from public, anon;
grant execute on function public.corrigir_site_venda(text, text) to authenticated;

-- Avisa a API do Supabase (PostgREST) para reler tabelas e funções.
notify pgrst, 'reload schema';
