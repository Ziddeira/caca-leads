-- Caça-leads — Etapa 8: verificação automática das vendas, pontos,
-- comprovante manual, rank mensal e prêmio do mês.
-- Rode isto DEPOIS da etapa 7, inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Depois de rodar, cadastre você como administrador (passo 14, no fim do
-- arquivo) — é um comando separado, com o seu e-mail.
--
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

-- 9. Comprovante manual (imagem ou PDF, até 5 MB) ----------------------------
-- Bucket PRIVADO: ninguém tem link público. O dono envia para a própria
-- pasta ("<id do usuário>/<id da venda>-<número>.<ext>"); só o dono e os
-- administradores conseguem abrir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprovantes',
  'comprovantes',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Administradores (só você). Ninguém recebe GRANT: você se cadastra pelo
-- SQL Editor (passo 14).
create table if not exists public.administradores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.administradores enable row level security;
revoke all on public.administradores from anon, authenticated;

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.administradores where user_id = auth.uid());
$$;

revoke all on function public.eh_admin() from public, anon;
grant execute on function public.eh_admin() to authenticated;

drop policy if exists "Comprovantes: dono envia na própria pasta" on storage.objects;
create policy "Comprovantes: dono envia na própria pasta"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Comprovantes: dono e administrador leem" on storage.objects;
create policy "Comprovantes: dono e administrador leem"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'comprovantes'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_admin())
  );

-- Sem política de update/delete: depois de enviado, o arquivo não muda.

-- Liga o comprovante (já enviado ao Storage) à venda e manda para análise.
-- Só depois de N tentativas automáticas sem confirmação.
create or replace function public.enviar_comprovante(p_venda_id bigint, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venda public.vendas%rowtype;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  select * into v_venda from public.vendas
    where id = p_venda_id and user_id = auth.uid()
    for update;

  if v_venda.id is null then
    raise exception 'Venda não encontrada.';
  end if;

  if v_venda.status not in ('pendente_verificacao', 'aguardando_google', 'nao_verificada') then
    raise exception 'Esta venda não aceita comprovante agora.';
  end if;

  if v_venda.tentativas < public.tentativas_para_comprovante() then
    raise exception 'O comprovante fica disponível depois de % verificações automáticas sem confirmação.',
      public.tentativas_para_comprovante();
  end if;

  if p_path is null
    or p_path !~ ('^' || auth.uid()::text || '/' || p_venda_id::text || '-[0-9]+\.(jpg|png|webp|pdf)$') then
    raise exception 'Arquivo do comprovante inválido.';
  end if;

  if not exists (
    select 1 from storage.objects where bucket_id = 'comprovantes' and name = p_path
  ) then
    raise exception 'O arquivo do comprovante não foi encontrado. Envie de novo.';
  end if;

  update public.vendas
    set status = 'em_analise',
        comprovante_path = p_path,
        comprovante_enviado_em = now(),
        motivo_verificacao = null
    where id = v_venda.id;
end;
$$;

revoke all on function public.enviar_comprovante(bigint, text) from public, anon;
grant execute on function public.enviar_comprovante(bigint, text) to authenticated;

-- 10. Tela do administrador ----------------------------------------------------
-- Lista as vendas com comprovante esperando análise. Recusa quem não é
-- administrador (a tela também esconde, mas quem decide é o banco).
create or replace function public.vendas_em_analise()
returns table (
  venda_id bigint,
  apelido text,
  email text,
  place_id text,
  nome_empresa text,
  site_url text,
  fechado_em date,
  tentativas integer,
  ultimo_motivo text,
  comprovante_path text,
  comprovante_enviado_em timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  return query
    select v.id, p.apelido, p.email, v.place_id,
           (to_jsonb(l) -> 'dados' ->> 'nome'),
           v.site_url, v.fechado_em, v.tentativas,
           (select vv.motivo from public.verificacoes_venda vv
             where vv.venda_id = v.id and vv.origem = 'automatica'
             order by vv.criado_em desc limit 1),
           v.comprovante_path, v.comprovante_enviado_em
      from public.vendas v
      join public.profiles p on p.id = v.user_id
      left join public.leads_desbloqueados l
        on l.user_id = v.user_id and l.place_id = v.place_id
      where v.status = 'em_analise'
      order by v.comprovante_enviado_em;
end;
$$;

revoke all on function public.vendas_em_analise() from public, anon;
grant execute on function public.vendas_em_analise() to authenticated;

-- Aprova (vira "verificada", +40 pontos) ou recusa (vira "recusada",
-- perde os 10 pontos). Recusar exige um motivo, que o usuário vê.
create or replace function public.analisar_comprovante(
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
  v_venda public.vendas%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_status text;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  select * into v_venda from public.vendas where id = p_venda_id for update;
  if v_venda.id is null then
    raise exception 'Venda não encontrada.';
  end if;
  if v_venda.status <> 'em_analise' then
    raise exception 'Esta venda não está em análise (situação atual: %).', v_venda.status;
  end if;
  if char_length(v_motivo) > 500 then
    raise exception 'O motivo pode ter no máximo 500 caracteres.';
  end if;

  if p_aprovar then
    if exists (
      select 1 from public.vendas
      where place_id = v_venda.place_id and status = 'verificada' and id <> v_venda.id
    ) then
      raise exception 'Esta empresa já tem uma venda verificada por outra conta.';
    end if;
    v_status := 'verificada';
  else
    if v_motivo is null then
      raise exception 'Explique o motivo da recusa (o usuário vai ver).';
    end if;
    v_status := 'recusada';
  end if;

  update public.vendas
    set status = v_status,
        motivo_verificacao = case when p_aprovar then null else v_motivo end,
        analisado_em = now()
    where id = v_venda.id;

  insert into public.verificacoes_venda (venda_id, user_id, origem, resultado, site_testado, motivo)
  values (v_venda.id, v_venda.user_id, 'manual',
          case when p_aprovar then 'aprovada' else 'recusada' end,
          v_venda.site_url, v_motivo);

  return v_status;
end;
$$;

revoke all on function public.analisar_comprovante(bigint, boolean, text) from public, anon;
grant execute on function public.analisar_comprovante(bigint, boolean, text) to authenticated;

-- 11. Score do usuário -------------------------------------------------------
-- Tudo lido do banco; o usuário só dispara a leitura.
create or replace function public.meu_score()
returns table (
  pontos integer,
  vendas_verificadas integer,
  vendas_pendentes integer,
  vendas_recusadas integer,
  verificacoes_no_mes integer,
  limite_verificacoes integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  return query
    select coalesce(sum(v.pontos), 0)::int,
           (count(*) filter (where v.status = 'verificada'))::int,
           (count(*) filter (where v.status not in ('verificada', 'recusada')))::int,
           (count(*) filter (where v.status = 'recusada'))::int,
           (select count(*)::int from public.verificacoes_venda vv
             where vv.user_id = auth.uid() and vv.origem = 'automatica'
               and vv.criado_em >= public.inicio_do_mes(public.mes_brasilia())),
           public.limite_verificacoes_mes()
      from public.vendas v
      where v.user_id = auth.uid();
end;
$$;

revoke all on function public.meu_score() from public, anon;
grant execute on function public.meu_score() to authenticated;

-- 12. Rank mensal ---------------------------------------------------------------
-- Conta as vendas VERIFICADAS no mês (pela data em que foram verificadas,
-- horário de Brasília). Empate: fica na frente quem chegou primeiro ao
-- número de vendas.

-- Histórico: a foto de cada mês fechado. O apelido fica guardado como
-- estava no fechamento.
create table if not exists public.rank_historico (
  mes date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  posicao integer not null,
  vendas integer not null,
  apelido text,
  premio_creditos integer not null default 0,
  primary key (mes, user_id)
);
alter table public.rank_historico enable row level security;
revoke all on public.rank_historico from anon, authenticated;

create table if not exists public.meses_fechados (
  mes date primary key,
  fechado_em timestamptz not null default now()
);
alter table public.meses_fechados enable row level security;
revoke all on public.meses_fechados from anon, authenticated;

-- Classificação de um mês qualquer, direto das vendas (uso interno).
create or replace function public.classificacao_do_mes(p_mes date)
returns table (user_id uuid, posicao integer, vendas integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.user_id,
         (row_number() over (order by c.vendas desc, c.ultima, c.user_id))::int,
         c.vendas
    from (
      select v.user_id, count(*)::int as vendas, max(v.verificado_em) as ultima
        from public.vendas v
        where v.status = 'verificada'
          and v.verificado_em >= public.inicio_do_mes(p_mes)
          and v.verificado_em < public.inicio_do_mes((p_mes + interval '1 month')::date)
        group by v.user_id
    ) c;
$$;

revoke all on function public.classificacao_do_mes(date) from public, anon, authenticated;

-- O que a página "Rank" lê. p_mes nulo = mês atual (ao vivo); um mês já
-- fechado vem do histórico. Devolve o top 10 e, se você estiver fora
-- dele, também a sua linha. Só apelido, avatar e número de vendas.
create or replace function public.rank_do_mes(p_mes date default null)
returns table (
  posicao integer,
  apelido text,
  foto_path text,
  avatar_pronto text,
  vendas integer,
  premio_creditos integer,
  eh_voce boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes date := public.primeiro_dia(coalesce(p_mes, public.mes_brasilia()));
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  if v_mes >= public.mes_brasilia() then
    return query
      select c.posicao, p.apelido, p.foto_path, p.avatar_pronto, c.vendas,
             0, c.user_id = auth.uid()
        from public.classificacao_do_mes(public.mes_brasilia()) c
        join public.profiles p on p.id = c.user_id
        where c.posicao <= 10 or c.user_id = auth.uid()
        order by c.posicao;
  else
    return query
      select h.posicao, coalesce(h.apelido, p.apelido), p.foto_path, p.avatar_pronto,
             h.vendas, h.premio_creditos, h.user_id = auth.uid()
        from public.rank_historico h
        left join public.profiles p on p.id = h.user_id
        where h.mes = v_mes and (h.posicao <= 10 or h.user_id = auth.uid())
        order by h.posicao;
  end if;
end;
$$;

revoke all on function public.rank_do_mes(date) from public, anon;
grant execute on function public.rank_do_mes(date) to authenticated;

-- Meses já fechados (para o seletor do histórico).
create or replace function public.meses_do_rank()
returns setof date
language sql
stable
security definer
set search_path = public
as $$
  select mes from public.meses_fechados order by mes desc limit 24;
$$;

revoke all on function public.meses_do_rank() from public, anon;
grant execute on function public.meses_do_rank() to authenticated;

-- 13. Prêmio e virada do mês -----------------------------------------------------
-- Créditos do prêmio ficam numa coluna SEPARADA dos créditos do plano:
-- a renovação do plano volta "creditos_desbloqueio" ao limite do plano, e
-- o prêmio não pode sumir junto. Não vencem. Não há prêmio em buscas.
alter table public.profiles
  add column if not exists creditos_premio integer not null default 0;
alter table public.profiles drop constraint if exists profiles_creditos_premio_valido;
alter table public.profiles add constraint profiles_creditos_premio_valido check (creditos_premio >= 0);
revoke insert, update, delete on public.profiles from authenticated, anon;

create or replace function public.premio_da_posicao(p_posicao integer)
returns integer
language sql
immutable
as $$
  select case p_posicao when 1 then 25 when 2 then 15 when 3 then 10 else 0 end;
$$;

-- Fecha UM mês: guarda o rank no histórico e credita o prêmio do top 3.
-- Idempotente: se o mês já foi fechado, não faz nada (nunca paga duas vezes).
create or replace function public.fechar_mes_rank(p_mes date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes date := public.primeiro_dia(p_mes);
  v_total integer;
begin
  if v_mes >= public.mes_brasilia() then
    raise exception 'Só dá para fechar meses que já acabaram.';
  end if;

  -- A linha em "meses_fechados" é a trava: duas chamadas ao mesmo tempo,
  -- só uma consegue inserir.
  insert into public.meses_fechados (mes) values (v_mes) on conflict (mes) do nothing;
  if not found then
    return 0;
  end if;

  insert into public.rank_historico (mes, user_id, posicao, vendas, apelido, premio_creditos)
    select v_mes, c.user_id, c.posicao, c.vendas, p.apelido, public.premio_da_posicao(c.posicao)
      from public.classificacao_do_mes(v_mes) c
      left join public.profiles p on p.id = c.user_id;
  get diagnostics v_total = row_count;

  update public.profiles p
    set creditos_premio = p.creditos_premio + h.premio_creditos
    from public.rank_historico h
    where h.mes = v_mes and h.user_id = p.id and h.premio_creditos > 0;

  return v_total;
end;
$$;

revoke all on function public.fechar_mes_rank(date) from public, anon, authenticated;

-- Fecha todos os meses que já acabaram e ainda não foram fechados (desde
-- o primeiro mês com venda verificada). Chamada pelas rotas agendadas;
-- se uma rodada falhar, a próxima fecha o que ficou para trás.
create or replace function public.fechar_meses_pendentes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes date;
  v_atual date := public.mes_brasilia();
  v_fechados integer := 0;
begin
  select public.mes_brasilia(min(verificado_em)) into v_mes
    from public.vendas where status = 'verificada';

  if v_mes is null then
    return 0;
  end if;

  while v_mes < v_atual loop
    if not exists (select 1 from public.meses_fechados where mes = v_mes) then
      perform public.fechar_mes_rank(v_mes);
      v_fechados := v_fechados + 1;
    end if;
    v_mes := (v_mes + interval '1 month')::date;
  end loop;

  return v_fechados;
end;
$$;

revoke all on function public.fechar_meses_pendentes() from public, anon, authenticated;
grant execute on function public.fechar_meses_pendentes() to service_role;

-- Desbloqueio agora usa primeiro os créditos do plano (que zeram na
-- renovação) e depois os do prêmio. Mesma função das etapas 2 e 3, com
-- o prêmio somado ao saldo.
create or replace function public.desbloquear_lead(p_place_id text)
returns table (ja_desbloqueado boolean, creditos_restantes integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plano_creditos integer;
  v_premio integer;
  v_existe boolean;
begin
  if p_place_id is null or length(trim(p_place_id)) = 0 then
    raise exception 'place_id inválido.';
  end if;

  perform public.aplicar_vencimento_plano(auth.uid());

  select creditos_desbloqueio, creditos_premio
    into v_plano_creditos, v_premio
    from public.profiles
    where id = auth.uid()
    for update;

  if v_plano_creditos is null then
    raise exception 'Perfil não encontrado.';
  end if;

  select exists(
    select 1 from public.leads_desbloqueados
    where user_id = auth.uid() and place_id = p_place_id
  ) into v_existe;

  if v_existe then
    return query select true, v_plano_creditos + v_premio;
    return;
  end if;

  if v_plano_creditos + v_premio < 1 then
    raise exception 'Você não tem créditos de desbloqueio disponíveis.';
  end if;

  if v_plano_creditos > 0 then
    update public.profiles
      set creditos_desbloqueio = creditos_desbloqueio - 1
      where id = auth.uid();
  else
    update public.profiles
      set creditos_premio = creditos_premio - 1
      where id = auth.uid();
  end if;

  insert into public.leads_desbloqueados (user_id, place_id)
  values (auth.uid(), p_place_id);

  return query select false, v_plano_creditos + v_premio - 1;
end;
$$;

grant execute on function public.desbloquear_lead(text) to authenticated;

-- "meu_plano" (etapa 3) passa a devolver o saldo total de desbloqueios
-- (plano + prêmio), que é o que o usuário pode gastar.
create or replace function public.meu_plano()
returns table (
  plano text,
  creditos_desbloqueio integer,
  buscas_restantes integer,
  plano_valido_ate timestamptz,
  tem_cliente_asaas boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  perform public.aplicar_vencimento_plano(auth.uid());

  return query
    select p.plano, p.creditos_desbloqueio + p.creditos_premio, p.buscas_restantes,
           p.plano_valido_ate, p.asaas_customer_id is not null
      from public.profiles p
      where p.id = auth.uid();
end;
$$;

revoke all on function public.meu_plano() from public, anon;
grant execute on function public.meu_plano() to authenticated;

-- Avisa a API do Supabase (PostgREST) para reler tabelas e funções.
notify pgrst, 'reload schema';

-- 14. Cadastre você como administrador (rode SEPARADO, uma vez) --------------
-- Troque pelo e-mail com que você entra no Caça-leads:
--
--   insert into public.administradores (user_id)
--   select id from auth.users where email = 'SEU-EMAIL@exemplo.com'
--   on conflict do nothing;
--
-- Para conferir o custo da verificação no mês (chamadas ao Google):
--
--   select count(*) from public.chamadas_google
--   where tipo = 'verificacao_venda'
--     and criado_em >= public.inicio_do_mes(public.mes_brasilia());
