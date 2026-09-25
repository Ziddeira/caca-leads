-- Ártemis Prospect — Etapa 3: planos e pagamento com Asaas
-- Rode isto DEPOIS de supabase/profiles.sql e supabase/etapa2-busca-desbloqueio.sql,
-- inteiro, de uma vez: Supabase > SQL Editor > New query > cole tudo > Run.
--
-- Regra de ouro desta etapa: plano e créditos só mudam por funções SQL
-- "security definer" deste arquivo. As que aplicam pagamentos só podem
-- ser chamadas pelo servidor (papel "service_role", usado pela rota do
-- webhook); o navegador (papéis "anon" e "authenticated") não consegue
-- nem executá-las.

-- 1. Novas colunas em "profiles" ------------------------------------------
-- asaas_customer_id: id do cliente no Asaas (criado na 1ª compra).
-- plano_valido_ate: fim do ciclo já pago. Depois dessa data (+ 3 dias de
-- tolerância para o pagamento da renovação ser confirmado), a conta volta
-- sozinha para o plano Grátis. Nulo = sem data de fim (plano Grátis).
alter table public.profiles
  add column if not exists asaas_customer_id text unique,
  add column if not exists plano_valido_ate timestamptz;

-- Cinto de segurança, igual ao da Etapa 2: o usuário nunca escreve em
-- profiles direto.
revoke insert, update, delete on public.profiles from authenticated, anon;

-- 2. Limites e preços dos planos ------------------------------------------
-- Mantenha estes números iguais aos de lib/planos.ts (que só serve para
-- mostrar na tela e para mandar o valor certo ao Asaas).
create or replace function public.limites_do_plano(
  p_plano text,
  out desbloqueios integer,
  out buscas integer
)
language sql
immutable
as $$
  select case p_plano when 'solo' then 50 when 'pro' then 100 else 5 end,
         case p_plano when 'solo' then 20 when 'pro' then 45 else 3 end;
$$;

-- Descobre o plano pelo valor efetivamente cobrado. Usado na renovação:
-- assim, se a troca de plano acontecer com uma cobrança já gerada no
-- valor antigo, o cliente recebe o plano pelo qual de fato pagou.
create or replace function public.plano_por_valor(p_valor numeric)
returns text
language sql
immutable
as $$
  select case p_valor when 34.90 then 'solo' when 69.90 then 'pro' else null end;
$$;

-- 3. Tabela "assinaturas" ------------------------------------------------
-- Uma linha por assinatura criada no Asaas. "plano" é o plano que será
-- cobrado nas próximas renovações (muda quando o usuário troca de plano;
-- o plano em uso de verdade fica em profiles.plano).
create table if not exists public.assinaturas (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  asaas_subscription_id text not null unique,
  plano text not null check (plano in ('solo', 'pro')),
  forma_pagamento text not null check (forma_pagamento in ('PIX', 'CREDIT_CARD')),
  status text not null default 'pendente'
    check (status in ('pendente', 'ativa', 'inadimplente', 'cancelada')),
  link_pagamento text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  cancelada_em timestamptz
);

-- No máximo uma assinatura não cancelada por usuário.
create unique index if not exists assinaturas_uma_viva_por_usuario
  on public.assinaturas (user_id)
  where status <> 'cancelada';

alter table public.assinaturas enable row level security;

grant usage on schema public to authenticated;
grant select on public.assinaturas to authenticated;

drop policy if exists "Usuários veem as próprias assinaturas" on public.assinaturas;
create policy "Usuários veem as próprias assinaturas"
  on public.assinaturas
  for select
  to authenticated
  using (user_id = auth.uid());

-- 4. Tabela "cobrancas" ----------------------------------------------------
-- Uma linha por cobrança (pagamento) do Asaas: cada mensalidade e cada
-- pacote extra. É ela que garante a idempotência do crédito: a coluna
-- "creditado_em" só é preenchida uma vez, então o Asaas pode mandar o
-- mesmo pagamento quantas vezes quiser (PAYMENT_CONFIRMED e depois
-- PAYMENT_RECEIVED, ou reenvios) que o crédito entra uma vez só.
create table if not exists public.cobrancas (
  asaas_payment_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('assinatura', 'pacote')),
  asaas_subscription_id text,
  plano text,
  valor numeric(10, 2),
  forma_pagamento text,
  link_pagamento text,
  status text,
  criado_em timestamptz not null default now(),
  creditado_em timestamptz,
  estornado_em timestamptz
);

create index if not exists cobrancas_user_idx on public.cobrancas (user_id, criado_em desc);

alter table public.cobrancas enable row level security;
-- Sem GRANT para o usuário: só as funções abaixo leem e escrevem aqui.

-- 5. Tabela "pagamentos_eventos" (auditoria) -------------------------------
-- Todo evento que chega no webhook (com token válido) é gravado aqui,
-- inclusive os que não mudam nada. "resultado" diz o que foi feito com ele. Para auditar:
--   select recebido_em, evento, valor, asaas_payment_id, resultado
--   from pagamentos_eventos order by recebido_em desc;
create table if not exists public.pagamentos_eventos (
  id bigint generated always as identity primary key,
  asaas_event_id text not null unique,
  evento text not null,
  asaas_payment_id text,
  asaas_subscription_id text,
  user_id uuid references auth.users (id) on delete set null,
  valor numeric(10, 2),
  forma_pagamento text,
  status_pagamento text,
  resultado text,
  payload jsonb not null,
  recebido_em timestamptz not null default now()
);

create index if not exists pagamentos_eventos_recebido_em_idx
  on public.pagamentos_eventos (recebido_em desc);
create index if not exists pagamentos_eventos_payment_idx
  on public.pagamentos_eventos (asaas_payment_id);

alter table public.pagamentos_eventos enable row level security;
-- Sem GRANT para o usuário. Você lê pelo SQL Editor / Table Editor.

-- 6. Fim do ciclo pago -> volta ao Grátis ----------------------------------
-- Se o plano pago passou da data de validade (+ 3 dias de tolerância) sem
-- a renovação ser confirmada — falta de pagamento ou assinatura
-- cancelada —, a conta volta ao Grátis, com os limites do Grátis. Os
-- leads já desbloqueados NÃO são apagados (nada aqui mexe em
-- leads_desbloqueados).
create or replace function public.aplicar_vencimento_plano(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lim record;
begin
  select * into v_lim from public.limites_do_plano('gratis');
  update public.profiles
    set plano = 'gratis',
        plano_valido_ate = null,
        creditos_desbloqueio = v_lim.desbloqueios,
        buscas_restantes = v_lim.buscas
    where id = p_user_id
      and plano <> 'gratis'
      and plano_valido_ate is not null
      and plano_valido_ate + interval '3 days' < now();
end;
$$;

revoke all on function public.aplicar_vencimento_plano(uuid) from public, anon, authenticated;

-- Versão para todo mundo de uma vez (opcional, para rodar agendado com
-- pg_cron — veja o fim do arquivo). Mesmo sem ela, o vencimento é
-- aplicado na hora em que o usuário abre o painel, busca ou desbloqueia.
create or replace function public.aplicar_vencimento_todos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lim record;
  v_total integer;
begin
  select * into v_lim from public.limites_do_plano('gratis');
  update public.profiles
    set plano = 'gratis',
        plano_valido_ate = null,
        creditos_desbloqueio = v_lim.desbloqueios,
        buscas_restantes = v_lim.buscas
    where plano <> 'gratis'
      and plano_valido_ate is not null
      and plano_valido_ate + interval '3 days' < now();
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke all on function public.aplicar_vencimento_todos() from public, anon, authenticated;

-- 7. "meu_plano": o que a tela "Meu plano" e a tela "Buscar" leem ----------
-- Aplica o vencimento (se houver) e devolve o plano e o saldo atuais.
-- O usuário pode chamar, mas não escolhe nenhum valor: só dispara a regra.
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
    select p.plano, p.creditos_desbloqueio, p.buscas_restantes,
           p.plano_valido_ate, p.asaas_customer_id is not null
      from public.profiles p
      where p.id = auth.uid();
end;
$$;

revoke all on function public.meu_plano() from public, anon;
grant execute on function public.meu_plano() to authenticated;

-- 8. iniciar_busca e desbloquear_lead, agora aplicando o vencimento -------
-- Mesmas funções da Etapa 2, com uma linha a mais no começo: antes de
-- conferir plano e saldo, aplica o vencimento. Assim um Pro vencido não
-- consegue usar o modo Hospedagem (continua validado aqui, no servidor).
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

  perform public.aplicar_vencimento_plano(auth.uid());

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

  perform public.aplicar_vencimento_plano(auth.uid());

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

-- 9. Funções usadas pelas rotas do servidor ao criar cobranças ------------
-- Só registram o que foi criado no Asaas. NENHUMA delas mexe em plano ou
-- créditos — isso só acontece quando o webhook confirma o pagamento.
-- Todas são exclusivas do papel "service_role" (servidor).

create or replace function public.salvar_cliente_asaas(p_user_id uuid, p_customer_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set asaas_customer_id = p_customer_id where id = p_user_id;
$$;

create or replace function public.registrar_assinatura(
  p_user_id uuid,
  p_subscription_id text,
  p_plano text,
  p_forma text,
  p_link text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.assinaturas (user_id, asaas_subscription_id, plano, forma_pagamento, link_pagamento)
  values (p_user_id, p_subscription_id, p_plano, p_forma, p_link);
$$;

create or replace function public.registrar_cobranca_pacote(
  p_user_id uuid,
  p_payment_id text,
  p_valor numeric,
  p_forma text,
  p_link text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.cobrancas (asaas_payment_id, user_id, tipo, valor, forma_pagamento, link_pagamento, status)
  values (p_payment_id, p_user_id, 'pacote', p_valor, p_forma, p_link, 'PENDING')
  on conflict (asaas_payment_id) do nothing;
$$;

-- Troca de plano: só muda o plano que será cobrado na próxima renovação.
-- O plano em uso (profiles.plano) só muda quando essa renovação for paga.
create or replace function public.agendar_troca_plano(
  p_user_id uuid,
  p_subscription_id text,
  p_plano text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.assinaturas
    set plano = p_plano, atualizado_em = now()
    where user_id = p_user_id and asaas_subscription_id = p_subscription_id;
$$;

create or replace function public.marcar_assinatura_cancelada(p_subscription_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.assinaturas
    set status = 'cancelada',
        cancelada_em = coalesce(cancelada_em, now()),
        atualizado_em = now()
    where asaas_subscription_id = p_subscription_id;
$$;

revoke all on function public.salvar_cliente_asaas(uuid, text) from public, anon, authenticated;
revoke all on function public.registrar_assinatura(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.registrar_cobranca_pacote(uuid, text, numeric, text, text) from public, anon, authenticated;
revoke all on function public.agendar_troca_plano(uuid, text, text) from public, anon, authenticated;
revoke all on function public.marcar_assinatura_cancelada(text) from public, anon, authenticated;

-- 10. O coração: processar um evento do webhook do Asaas -------------------
-- A rota /api/asaas/webhook confere o token e chama esta função com o
-- JSON inteiro que o Asaas mandou. Tudo acontece numa transação só.
--
-- Idempotência em duas camadas:
--   a) o id do evento é único em pagamentos_eventos: evento repetido é
--      registrado uma vez só e ignorado nas próximas ("duplicado");
--   b) o crédito de cada cobrança só entra uma vez (cobrancas.creditado_em),
--      mesmo que venham eventos diferentes para o mesmo pagamento
--      (PAYMENT_CONFIRMED e depois PAYMENT_RECEIVED).
create or replace function public.processar_evento_asaas(p_payload jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento text := p_payload ->> 'event';
  v_pay jsonb := p_payload -> 'payment';
  v_sub jsonb := p_payload -> 'subscription';
  v_payment_id text := v_pay ->> 'id';
  v_subscription_id text := coalesce(v_pay ->> 'subscription', v_sub ->> 'id');
  v_customer_id text := coalesce(v_pay ->> 'customer', v_sub ->> 'customer');
  v_ref text := coalesce(v_pay ->> 'externalReference', v_sub ->> 'externalReference');
  v_valor numeric := nullif(v_pay ->> 'value', '')::numeric;
  v_event_id text;
  v_user uuid;
  v_log_id bigint;
  v_resultado text;
  v_cob public.cobrancas%rowtype;
  v_plano text;
  v_lim record;
  v_fim_ciclo timestamptz;
  v_valido_ate timestamptz;
begin
  if v_evento is null then
    raise exception 'Evento sem o campo "event".';
  end if;

  -- O Asaas manda um id único por evento ("evt_..."). Se por algum motivo
  -- não vier, monta uma chave estável com o que identifica o evento.
  v_event_id := coalesce(
    p_payload ->> 'id',
    v_evento || ':' || coalesce(v_payment_id, v_subscription_id, md5(p_payload::text))
      || ':' || coalesce(v_pay ->> 'status', v_sub ->> 'status', '')
  );

  -- Descobre de quem é o evento: pela assinatura, pela cobrança, pela
  -- referência externa que o nosso servidor mandou ou pelo cliente.
  if v_subscription_id is not null then
    select user_id into v_user from public.assinaturas
      where asaas_subscription_id = v_subscription_id;
  end if;
  if v_user is null and v_payment_id is not null then
    select user_id into v_user from public.cobrancas
      where asaas_payment_id = v_payment_id;
  end if;
  if v_user is null and v_ref ~ '^(assinatura|pacote):[0-9a-f-]{36}$' then
    select id into v_user from public.profiles
      where id = split_part(v_ref, ':', 2)::uuid;
  end if;
  if v_user is null and v_customer_id is not null then
    select id into v_user from public.profiles
      where asaas_customer_id = v_customer_id;
  end if;

  insert into public.pagamentos_eventos (
    asaas_event_id, evento, asaas_payment_id, asaas_subscription_id,
    user_id, valor, forma_pagamento, status_pagamento, payload
  ) values (
    v_event_id, v_evento, v_payment_id, v_subscription_id,
    v_user, v_valor, v_pay ->> 'billingType', coalesce(v_pay ->> 'status', v_sub ->> 'status'), p_payload
  )
  on conflict (asaas_event_id) do nothing
  returning id into v_log_id;

  if v_log_id is null then
    return 'duplicado';
  end if;

  if v_user is null then
    v_resultado := 'usuario_nao_encontrado';

  -- Pagamento confirmado (cartão aprovado ou Pix pago) --------------------
  elsif v_evento in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED') and v_payment_id is not null then
    insert into public.cobrancas (
      asaas_payment_id, user_id, tipo, asaas_subscription_id, valor, forma_pagamento, link_pagamento, status
    ) values (
      v_payment_id, v_user,
      case when v_subscription_id is not null then 'assinatura' else 'pacote' end,
      v_subscription_id, v_valor, v_pay ->> 'billingType', v_pay ->> 'invoiceUrl', v_pay ->> 'status'
    )
    on conflict (asaas_payment_id) do nothing;

    -- Trava a cobrança e o perfil: dois eventos do mesmo pagamento
    -- chegando ao mesmo tempo são processados um depois do outro.
    select * into v_cob from public.cobrancas
      where asaas_payment_id = v_payment_id
      for update;
    perform 1 from public.profiles where id = v_user for update;

    update public.cobrancas set status = v_pay ->> 'status'
      where asaas_payment_id = v_payment_id;

    if v_cob.estornado_em is not null then
      v_resultado := 'ignorado_cobranca_estornada';
    elsif v_cob.creditado_em is not null then
      v_resultado := 'ja_creditado';
    elsif v_cob.tipo = 'pacote' then
      -- Pacote extra: SOMA ao saldo atual.
      update public.profiles
        set creditos_desbloqueio = creditos_desbloqueio + 25,
            buscas_restantes = buscas_restantes + 15
        where id = v_user;
      update public.cobrancas set creditado_em = now()
        where asaas_payment_id = v_payment_id;
      v_resultado := 'pacote_creditado';
    else
      -- Mensalidade: o plano é o do valor pago (ou, se o valor não bater
      -- com nenhum plano, o que está registrado na assinatura).
      v_plano := public.plano_por_valor(v_valor);
      if v_plano is null then
        select plano into v_plano from public.assinaturas
          where asaas_subscription_id = v_subscription_id;
      end if;

      if v_plano is null then
        v_resultado := 'erro_plano_desconhecido';
      else
        select * into v_lim from public.limites_do_plano(v_plano);
        -- O ciclo pago vai do vencimento desta cobrança até o mesmo dia
        -- do mês seguinte (meia-noite no horário de Brasília).
        v_fim_ciclo := (
          (coalesce((v_pay ->> 'dueDate')::date, current_date) + interval '1 month')::date
        )::timestamp at time zone 'America/Sao_Paulo';

        -- Renovação: saldo VOLTA ao limite do plano (não acumula).
        update public.profiles
          set plano = v_plano,
              creditos_desbloqueio = v_lim.desbloqueios,
              buscas_restantes = v_lim.buscas,
              plano_valido_ate = greatest(coalesce(plano_valido_ate, v_fim_ciclo), v_fim_ciclo)
          where id = v_user;

        update public.assinaturas
          set status = 'ativa', atualizado_em = now()
          where asaas_subscription_id = v_subscription_id
            and status <> 'cancelada';

        update public.cobrancas
          set creditado_em = now(), plano = v_plano
          where asaas_payment_id = v_payment_id;
        v_resultado := 'plano_renovado_' || v_plano;
      end if;
    end if;

  -- Pagamento recusado ou vencido sem pagar -------------------------------
  -- Não mexe em plano nem créditos: o plano atual vale até o fim do ciclo
  -- já pago; se ninguém pagar, a conta volta ao Grátis sozinha depois.
  elsif v_evento in ('PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', 'PAYMENT_REPROVED_BY_RISK_ANALYSIS', 'PAYMENT_OVERDUE') then
    update public.cobrancas set status = v_pay ->> 'status'
      where asaas_payment_id = v_payment_id;
    if v_subscription_id is not null then
      update public.assinaturas
        set status = case when status = 'ativa' then 'inadimplente' else status end,
            link_pagamento = coalesce(v_pay ->> 'invoiceUrl', link_pagamento),
            atualizado_em = now()
        where asaas_subscription_id = v_subscription_id
          and status <> 'cancelada';
    end if;
    v_resultado := 'pagamento_nao_aprovado';

  -- Estorno ou contestação (chargeback) ------------------------------------
  elsif v_evento in ('PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED') and v_payment_id is not null then
    -- Garante a linha da cobrança já marcada como estornada: se o
    -- "confirmado" chegar depois, fora de ordem, não credita nada.
    insert into public.cobrancas (
      asaas_payment_id, user_id, tipo, asaas_subscription_id, valor, forma_pagamento, status, estornado_em
    ) values (
      v_payment_id, v_user,
      case when v_subscription_id is not null then 'assinatura' else 'pacote' end,
      v_subscription_id, v_valor, v_pay ->> 'billingType', v_pay ->> 'status', now()
    )
    on conflict (asaas_payment_id) do nothing;

    select * into v_cob from public.cobrancas
      where asaas_payment_id = v_payment_id
      for update;
    perform 1 from public.profiles where id = v_user for update;

    if v_cob.creditado_em is null then
      update public.cobrancas
        set estornado_em = coalesce(estornado_em, now()), status = v_pay ->> 'status'
        where asaas_payment_id = v_payment_id;
      v_resultado := 'estorno_sem_credito_a_remover';
    elsif v_cob.estornado_em is not null then
      v_resultado := 'ja_estornado';
    elsif v_cob.tipo = 'pacote' then
      -- Tira o que o pacote deu (sem deixar negativo).
      update public.profiles
        set creditos_desbloqueio = greatest(0, creditos_desbloqueio - 25),
            buscas_restantes = greatest(0, buscas_restantes - 15)
        where id = v_user;
      update public.cobrancas set estornado_em = now(), status = v_pay ->> 'status'
        where asaas_payment_id = v_payment_id;
      v_resultado := 'pacote_estornado';
    else
      -- Mensalidade estornada: se for a cobrança do ciclo atual, a conta
      -- volta ao Grátis na hora (sem ganhar saldo novo). Estorno de um
      -- mês antigo não derruba o mês atual, que foi pago por outra cobrança.
      v_fim_ciclo := (
        (coalesce((v_pay ->> 'dueDate')::date, current_date) + interval '1 month')::date
      )::timestamp at time zone 'America/Sao_Paulo';
      select plano_valido_ate into v_valido_ate from public.profiles where id = v_user;

      if v_valido_ate is null or v_fim_ciclo >= v_valido_ate then
        select * into v_lim from public.limites_do_plano('gratis');
        update public.profiles
          set plano = 'gratis',
              plano_valido_ate = null,
              creditos_desbloqueio = least(creditos_desbloqueio, v_lim.desbloqueios),
              buscas_restantes = least(buscas_restantes, v_lim.buscas)
          where id = v_user;
        v_resultado := 'mensalidade_estornada_plano_gratis';
      else
        v_resultado := 'mensalidade_antiga_estornada';
      end if;
      update public.cobrancas set estornado_em = now(), status = v_pay ->> 'status'
        where asaas_payment_id = v_payment_id;
    end if;

  -- Assinatura cancelada ----------------------------------------------------
  -- Não mexe no plano agora: ele vale até o fim do ciclo pago.
  elsif v_evento in ('SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED') and v_subscription_id is not null then
    perform public.marcar_assinatura_cancelada(v_subscription_id);
    v_resultado := 'assinatura_cancelada';

  else
    v_resultado := 'ignorado';
  end if;

  update public.pagamentos_eventos set resultado = v_resultado where id = v_log_id;
  return v_resultado;
end;
$$;

revoke all on function public.processar_evento_asaas(jsonb) from public, anon, authenticated;

-- 11. Libera as funções do servidor para o papel "service_role" ------------
grant usage on schema public to service_role;
grant execute on function public.processar_evento_asaas(jsonb) to service_role;
grant execute on function public.salvar_cliente_asaas(uuid, text) to service_role;
grant execute on function public.registrar_assinatura(uuid, text, text, text, text) to service_role;
grant execute on function public.registrar_cobranca_pacote(uuid, text, numeric, text, text) to service_role;
grant execute on function public.agendar_troca_plano(uuid, text, text) to service_role;
grant execute on function public.marcar_assinatura_cancelada(text) to service_role;
grant execute on function public.aplicar_vencimento_todos() to service_role;

-- 12. (Opcional) Vencimento automático todo dia ----------------------------
-- O vencimento já é aplicado quando o usuário usa o painel. Se quiser que
-- o plano mude no banco mesmo para quem não entra, ative a extensão
-- pg_cron (Database > Extensions > pg_cron) e rode, separadamente:
--
--   select cron.schedule('vencer-planos', '0 4 * * *',
--     $$select public.aplicar_vencimento_todos()$$);
