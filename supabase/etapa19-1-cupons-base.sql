-- Ártemis Prospect — Etapa 19, parte 1 de 2: promoções e cupons (tabelas,
-- cálculo do preço e acompanhamento automático das mensalidades)
-- Rode DEPOIS de todos os scripts anteriores (até a etapa 18), inteiro,
-- de uma vez: Supabase > SQL Editor > New query > cole tudo > Run.
-- Depois rode a parte 2 (etapa19-2-cupons-funcoes.sql).
-- Pode rodar de novo sem problema (é idempotente).
--
-- Regras desta etapa:
--   * o preço com desconto é calculado SÓ aqui no banco. O navegador manda
--     apenas o código do cupom; o servidor pergunta ao banco o valor e é
--     esse valor que vai para o Asaas;
--   * o Asaas não tem "desconto nos N primeiros meses" em assinatura.
--     Por isso a assinatura é criada com o valor já com desconto e, quando
--     o último mês com desconto é pago, o nosso servidor muda o valor da
--     assinatura no Asaas de volta ao preço normal;
--   * nenhum cupom deixa o preço final abaixo do piso que você configura
--     (nunca menos que R$ 5,00, o mínimo que o Asaas aceita numa cobrança);
--   * as tabelas novas não têm GRANT para o navegador: tudo passa por
--     funções, e as de administrador conferem public.eh_admin().

-- 1. Configuração: o piso ---------------------------------------------------
-- Uma linha só. piso_minimo = o menor valor mensal que um assinante pode
-- pagar com qualquer cupom (o seu custo mínimo por assinante).
create table if not exists public.cupons_config (
  id boolean primary key default true check (id),
  piso_minimo numeric(10, 2) not null default 5.00 check (piso_minimo >= 5.00),
  atualizado_em timestamptz not null default now()
);

insert into public.cupons_config (id) values (true) on conflict (id) do nothing;

alter table public.cupons_config enable row level security;
revoke all on public.cupons_config from anon, authenticated;

-- 2. Tabela "cupons" --------------------------------------------------------
--   codigo: letras maiúsculas, números, "-" ou "_" (3 a 30), único.
--   tipo_desconto: 'percentual' (valor_desconto = % de 1 a 100) ou
--                  'fixo' (valor_desconto = reais tirados do preço).
--   duracao_meses: 1 = só o primeiro mês; 3 = os 3 primeiros meses;
--                  nulo = enquanto a assinatura durar.
--   planos: {solo}, {pro} ou {solo,pro}.
--   inicio_em / fim_em: validade, datas de Brasília, fim inclusive.
--   limite_total: nulo = sem limite. limite_por_usuario: pelo menos 1.
--   so_novos: só para quem nunca teve uma mensalidade paga.
--   ativo: falso = pausado (ninguém consegue usar).
create table if not exists public.cupons (
  id bigint generated always as identity primary key,
  codigo text not null unique check (codigo ~ '^[A-Z0-9_-]{3,30}$'),
  tipo_desconto text not null check (tipo_desconto in ('percentual', 'fixo')),
  valor_desconto numeric(10, 2) not null check (valor_desconto > 0),
  duracao_meses integer check (duracao_meses is null or duracao_meses in (1, 3)),
  planos text[] not null check (
    cardinality(planos) between 1 and 2 and planos <@ array['solo', 'pro']::text[]
  ),
  inicio_em date not null,
  fim_em date not null,
  limite_total integer check (limite_total is null or limite_total between 1 and 1000000),
  limite_por_usuario integer not null default 1 check (limite_por_usuario between 1 and 100),
  so_novos boolean not null default false,
  ativo boolean not null default true,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint cupons_datas_validas check (fim_em >= inicio_em),
  constraint cupons_percentual_valido check (tipo_desconto <> 'percentual' or valor_desconto <= 100)
);

alter table public.cupons enable row level security;
revoke all on public.cupons from anon, authenticated;

-- 3. Tabela "cupom_usos" ----------------------------------------------------
-- Uma linha por assinatura criada com cupom. Guarda uma "foto" do
-- desconto no momento do uso: se você editar o cupom depois, quem já
-- assinou continua com o que foi combinado.
--   ciclos_pagos: quantas mensalidades dessa assinatura já foram pagas.
--   status:
--     ativo     → o desconto está valendo;
--     voltando  → o último mês com desconto foi pago; falta o servidor
--                 mudar o valor no Asaas para o preço normal;
--     encerrado → a assinatura já está no preço normal;
--     cancelado → a assinatura foi cancelada.
--   proxima_cobranca_cheia: dia da primeira mensalidade no preço normal
--     (usado para avisar pelo sino uma semana antes).
create table if not exists public.cupom_usos (
  id bigint generated always as identity primary key,
  cupom_id bigint not null references public.cupons (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  asaas_subscription_id text not null unique,
  plano text not null check (plano in ('solo', 'pro')),
  tipo_desconto text not null check (tipo_desconto in ('percentual', 'fixo')),
  valor_desconto numeric(10, 2) not null,
  duracao_meses integer,
  valor_cheio numeric(10, 2) not null,
  valor_com_desconto numeric(10, 2) not null,
  ciclos_pagos integer not null default 0,
  status text not null default 'ativo'
    check (status in ('ativo', 'voltando', 'encerrado', 'cancelado')),
  motivo_fim text,
  proxima_cobranca_cheia date,
  preco_normal_em timestamptz,
  criado_em timestamptz not null default now(),
  encerrado_em timestamptz
);

create index if not exists cupom_usos_cupom_idx on public.cupom_usos (cupom_id);
create index if not exists cupom_usos_user_idx on public.cupom_usos (user_id, cupom_id);
create index if not exists cupom_usos_voltando_idx on public.cupom_usos (status) where status = 'voltando';

alter table public.cupom_usos enable row level security;
revoke all on public.cupom_usos from anon, authenticated;

-- 4. Tabela "cupom_descontos" -------------------------------------------------
-- Uma linha por mensalidade paga com desconto: quanto seria o preço
-- normal, quanto foi pago e a diferença. É daqui que sai o "quanto foi
-- concedido de desconto" de cada cupom. Estornos ficam marcados e não
-- entram na soma.
create table if not exists public.cupom_descontos (
  asaas_payment_id text primary key references public.cobrancas (asaas_payment_id) on delete cascade,
  uso_id bigint not null references public.cupom_usos (id) on delete cascade,
  valor_cheio numeric(10, 2) not null,
  valor_pago numeric(10, 2) not null,
  desconto numeric(10, 2) not null,
  estornado boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists cupom_descontos_uso_idx on public.cupom_descontos (uso_id);

alter table public.cupom_descontos enable row level security;
revoke all on public.cupom_descontos from anon, authenticated;

-- 5. Cálculo do preço -----------------------------------------------------------
-- O mesmo cálculo está em lib/cupons.ts, só para mostrar na tela. Quem
-- vale é este.
create or replace function public.preco_com_cupom(p_preco numeric, p_tipo text, p_valor numeric)
returns numeric
language sql
immutable
as $$
  select case p_tipo
    when 'percentual' then round(p_preco * (100 - p_valor) / 100, 2)
    when 'fixo' then round(p_preco - p_valor, 2)
  end;
$$;

-- O piso em vigor (nunca menos que R$ 5,00).
create or replace function public.piso_cupons()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(5.00, coalesce((select piso_minimo from public.cupons_config where id), 5.00));
$$;

revoke all on function public.piso_cupons() from public, anon, authenticated;

-- Confere se um desconto é seguro para todos os planos escolhidos.
-- Recusa quando:
--   * o preço final fica abaixo do piso;
--   * o preço final do Pro fica igual ao preço cheio do Solo (R$ 34,90).
--     O webhook descobre o plano pelo valor pago, e esse empate faria um
--     assinante Pro receber o Solo.
create or replace function public.validar_desconto_cupom(p_tipo text, p_valor numeric, p_planos text[])
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plano text;
  v_final numeric;
  v_piso numeric := public.piso_cupons();
begin
  foreach v_plano in array p_planos loop
    v_final := public.preco_com_cupom(public.preco_do_plano(v_plano), p_tipo, p_valor);
    if v_final is null or v_final < v_piso then
      raise exception 'Com esse desconto o plano % sairia por R$ %, abaixo do piso de R$ %.',
        initcap(v_plano),
        replace(to_char(coalesce(v_final, 0), 'FM999990.00'), '.', ','),
        replace(to_char(v_piso, 'FM999990.00'), '.', ',');
    end if;
    if v_plano = 'pro' and v_final = public.preco_do_plano('solo') then
      raise exception 'O Pro com desconto não pode custar exatamente o preço cheio do Solo (R$ 34,90). Ajuste o desconto em alguns centavos.';
    end if;
  end loop;
end;
$$;

revoke all on function public.validar_desconto_cupom(text, numeric, text[]) from public, anon, authenticated;

-- 6. Acompanhamento automático das mensalidades -----------------------------
-- Roda sozinho quando o webhook do Asaas credita (ou estorna) uma
-- mensalidade (etapa 3). Não muda nada no crédito do plano; só anota:
--   * +1 mês pago no uso do cupom;
--   * o desconto dado nessa mensalidade;
--   * se esse era o último mês com desconto → status "voltando" (o
--     servidor muda o valor no Asaas logo em seguida).
create or replace function public.cupom_acompanhar_cobranca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uso public.cupom_usos%rowtype;
  v_cheio numeric;
begin
  if new.tipo <> 'assinatura' or new.asaas_subscription_id is null then
    return new;
  end if;

  select * into v_uso from public.cupom_usos
    where asaas_subscription_id = new.asaas_subscription_id
    for update;
  if v_uso.id is null then
    return new;
  end if;

  if old.creditado_em is null and new.creditado_em is not null then
    update public.cupom_usos
      set ciclos_pagos = ciclos_pagos + 1
      where id = v_uso.id
      returning * into v_uso;

    v_cheio := public.preco_do_plano(coalesce(new.plano, v_uso.plano));
    if new.valor is not null and v_cheio > 0 and new.valor < v_cheio then
      insert into public.cupom_descontos (asaas_payment_id, uso_id, valor_cheio, valor_pago, desconto)
      values (new.asaas_payment_id, v_uso.id, v_cheio, new.valor, v_cheio - new.valor)
      on conflict (asaas_payment_id) do nothing;
    end if;

    if v_uso.status = 'ativo'
       and v_uso.duracao_meses is not null
       and v_uso.ciclos_pagos >= v_uso.duracao_meses then
      -- O webhook já atualizou profiles.plano_valido_ate antes de marcar
      -- a cobrança como creditada: esse é o dia da próxima mensalidade,
      -- a primeira no preço normal.
      update public.cupom_usos
        set status = 'voltando',
            motivo_fim = 'duracao',
            encerrado_em = now(),
            proxima_cobranca_cheia = (
              select (p.plano_valido_ate at time zone 'America/Sao_Paulo')::date
                from public.profiles p where p.id = new.user_id
            )
        where id = v_uso.id;
    end if;
  end if;

  if old.estornado_em is null and new.estornado_em is not null then
    update public.cupom_descontos set estornado = true
      where asaas_payment_id = new.asaas_payment_id;
  end if;

  return new;
end;
$$;

revoke all on function public.cupom_acompanhar_cobranca() from public, anon, authenticated;

drop trigger if exists cobrancas_acompanhar_cupom on public.cobrancas;
create trigger cobrancas_acompanhar_cupom
  after update of creditado_em, estornado_em on public.cobrancas
  for each row execute function public.cupom_acompanhar_cobranca();

-- Assinatura cancelada → o uso do cupom também. Se nenhuma mensalidade
-- foi paga, esse uso deixa de contar nos limites do cupom.
create or replace function public.cupom_acompanhar_cancelamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelada' and old.status is distinct from 'cancelada' then
    update public.cupom_usos
      set status = 'cancelado',
          motivo_fim = coalesce(motivo_fim, 'assinatura_cancelada'),
          encerrado_em = coalesce(encerrado_em, now())
      where asaas_subscription_id = new.asaas_subscription_id
        and status in ('ativo', 'voltando');
  end if;
  return new;
end;
$$;

revoke all on function public.cupom_acompanhar_cancelamento() from public, anon, authenticated;

drop trigger if exists assinaturas_acompanhar_cupom on public.assinaturas;
create trigger assinaturas_acompanhar_cupom
  after update of status on public.assinaturas
  for each row execute function public.cupom_acompanhar_cancelamento();

notify pgrst, 'reload schema';
