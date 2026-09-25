-- Ártemis Prospect — Etapa 11, parte 2 de 3: números do painel de Gestão
-- (visão geral, uso e custo, pagamentos, usuários)
-- Rode DEPOIS da parte 1 (etapa11-1-admin-base.sql), inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Todas as funções daqui começam com "if not public.eh_admin() then
-- raise exception": uma conta comum que tente chamá-las recebe erro,
-- mesmo chamando direto pela API do Supabase, sem passar pelo site.
-- Datas sempre no horário de Brasília; "mês" = mês corrente.

-- 1. Preço mensal de cada plano ---------------------------------------------
-- Mantenha igual a lib/planos.ts e a plano_por_valor (etapa 3).
create or replace function public.preco_do_plano(p_plano text)
returns numeric
language sql
immutable
as $$
  select case p_plano when 'solo' then 34.90 when 'pro' then 69.90 else 0 end::numeric;
$$;

-- 2. Visão geral -------------------------------------------------------------
-- assinantes_por_plano: contas com plano pago ainda válido (o mesmo
--   critério de vencimento da etapa 3: data de validade + 3 dias).
-- receita_mensal_recorrente: soma do preço das assinaturas ativas no Asaas.
-- conversao: contas que já tiveram alguma mensalidade paga (e não
--   estornada) ÷ total de contas.
create or replace function public.admin_visao_geral()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inicio timestamptz := public.inicio_do_mes(public.mes_brasilia());
  v_resultado jsonb;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  with pagantes as (
    select distinct c.user_id
      from public.cobrancas c
      where c.tipo = 'assinatura'
        and c.creditado_em is not null
        and c.estornado_em is null
  ),
  primeira_paga as (
    select c.user_id, min(c.creditado_em) as primeira
      from public.cobrancas c
      where c.tipo = 'assinatura' and c.creditado_em is not null
      group by c.user_id
  )
  select jsonb_build_object(
    'contas_total', (select count(*) from public.profiles),
    'assinantes_por_plano', jsonb_build_object(
      'solo', (select count(*) from public.profiles p
                where p.plano = 'solo'
                  and (p.plano_valido_ate is null or p.plano_valido_ate + interval '3 days' >= now())),
      'pro', (select count(*) from public.profiles p
               where p.plano = 'pro'
                 and (p.plano_valido_ate is null or p.plano_valido_ate + interval '3 days' >= now()))
    ),
    'contas_gratis', (select count(*) from public.profiles p
                       where p.plano = 'gratis'
                          or (p.plano_valido_ate is not null and p.plano_valido_ate + interval '3 days' < now())),
    'novos_cadastros_mes', (select count(*) from public.profiles where created_at >= v_inicio),
    'assinaturas_ativas', (select count(*) from public.assinaturas where status = 'ativa'),
    'assinaturas_inadimplentes', (select count(*) from public.assinaturas where status = 'inadimplente'),
    'receita_mensal_recorrente', (select coalesce(sum(public.preco_do_plano(plano)), 0)
                                    from public.assinaturas where status = 'ativa'),
    'receita_em_risco', (select coalesce(sum(public.preco_do_plano(plano)), 0)
                           from public.assinaturas where status = 'inadimplente'),
    'recebido_no_mes', (select coalesce(sum(valor), 0) from public.cobrancas
                          where creditado_em >= v_inicio and estornado_em is null),
    'cancelamentos_mes', (select count(*) from public.assinaturas where cancelada_em >= v_inicio),
    'contas_que_pagaram', (select count(*) from pagantes),
    'novos_assinantes_mes', (select count(*) from primeira_paga where primeira >= v_inicio)
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.admin_visao_geral() from public, anon;
grant execute on function public.admin_visao_geral() to authenticated;

-- 3. Uso e custo ---------------------------------------------------------------
-- Buscas e desbloqueios do mês, chamadas ao Google por tipo e por dia
-- (da tabela chamadas_google, etapa 2). O custo em dinheiro é calculado
-- na tela (lib/admin/custos.ts), com o preço de cada tipo de chamada.
create or replace function public.admin_uso_custo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mes date := public.mes_brasilia();
  v_inicio timestamptz := public.inicio_do_mes(public.mes_brasilia());
  v_resultado jsonb;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  select jsonb_build_object(
    'buscas_mes', (select count(*) from public.buscas where criado_em >= v_inicio),
    'desbloqueios_mes', (select count(*) from public.leads_desbloqueados where desbloqueado_em >= v_inicio),
    'chamadas_por_tipo', coalesce((
      select jsonb_object_agg(tipo, qtd)
        from (select tipo, count(*) as qtd from public.chamadas_google
               where criado_em >= v_inicio group by tipo) t
    ), '{}'::jsonb),
    'chamadas_por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', dia, 'tipos', tipos) order by dia)
        from (
          select dia, jsonb_object_agg(tipo, qtd) as tipos
            from (
              select (criado_em at time zone 'America/Sao_Paulo')::date as dia, tipo, count(*) as qtd
                from public.chamadas_google
                where criado_em >= v_inicio
                group by 1, 2
            ) x
            group by dia
        ) d
    ), '[]'::jsonb),
    'mes', v_mes
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.admin_uso_custo() from public, anon;
grant execute on function public.admin_uso_custo() to authenticated;

-- Os usuários que mais consomem no mês (por chamadas ao Google, que é o
-- que custa dinheiro; empate desempata por buscas).
create or replace function public.admin_top_consumidores(p_limite integer default 10)
returns table (
  user_id uuid,
  email text,
  apelido text,
  plano text,
  chamadas bigint,
  buscas bigint,
  desbloqueios bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inicio timestamptz := public.inicio_do_mes(public.mes_brasilia());
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  return query
    with c as (
      select g.user_id, count(*) as n from public.chamadas_google g
       where g.criado_em >= v_inicio and g.user_id is not null group by g.user_id
    ),
    b as (
      select x.user_id, count(*) as n from public.buscas x
       where x.criado_em >= v_inicio group by x.user_id
    ),
    d as (
      select l.user_id, count(*) as n from public.leads_desbloqueados l
       where l.desbloqueado_em >= v_inicio group by l.user_id
    ),
    ids as (
      select c.user_id from c union select b.user_id from b union select d.user_id from d
    )
    select p.id, p.email, p.apelido, p.plano,
           coalesce(c.n, 0), coalesce(b.n, 0), coalesce(d.n, 0)
      from ids
      join public.profiles p on p.id = ids.user_id
      left join c on c.user_id = ids.user_id
      left join b on b.user_id = ids.user_id
      left join d on d.user_id = ids.user_id
      order by coalesce(c.n, 0) desc, coalesce(b.n, 0) desc, coalesce(d.n, 0) desc
      limit greatest(1, least(coalesce(p_limite, 10), 100));
end;
$$;

revoke all on function public.admin_top_consumidores(integer) from public, anon;
grant execute on function public.admin_top_consumidores(integer) to authenticated;

-- 4. Pagamentos ------------------------------------------------------------------
-- Os últimos eventos recebidos do Asaas (tabela pagamentos_eventos, etapa
-- 3), com o e-mail e o apelido de quem pagou.
create or replace function public.admin_pagamentos(p_limite integer default 200)
returns table (
  id bigint,
  recebido_em timestamptz,
  evento text,
  valor numeric,
  forma_pagamento text,
  status_pagamento text,
  resultado text,
  user_id uuid,
  email text,
  apelido text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  return query
    select e.id, e.recebido_em, e.evento, e.valor, e.forma_pagamento,
           e.status_pagamento, e.resultado, e.user_id, p.email, p.apelido
      from public.pagamentos_eventos e
      left join public.profiles p on p.id = e.user_id
      order by e.recebido_em desc, e.id desc
      limit greatest(1, least(coalesce(p_limite, 200), 500));
end;
$$;

revoke all on function public.admin_pagamentos(integer) from public, anon;
grant execute on function public.admin_pagamentos(integer) to authenticated;

-- 5. Usuários -------------------------------------------------------------------
-- Busca por pedaço do e-mail ou do apelido. Sem termo: as 20 contas mais
-- novas.
create or replace function public.admin_buscar_usuarios(p_termo text)
returns table (
  id uuid,
  email text,
  apelido text,
  plano text,
  creditos_desbloqueio integer,
  creditos_premio integer,
  buscas_restantes integer,
  plano_valido_ate timestamptz,
  created_at timestamptz,
  is_admin boolean,
  assinatura_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- Escapa % e _ para o termo ser procurado ao pé da letra.
  v_termo text := replace(replace(replace(btrim(coalesce(p_termo, '')), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  return query
    select p.id, p.email, p.apelido, p.plano,
           p.creditos_desbloqueio, p.creditos_premio, p.buscas_restantes,
           p.plano_valido_ate, p.created_at, p.is_admin,
           (select a.status from public.assinaturas a
             where a.user_id = p.id
             order by (a.status <> 'cancelada') desc, a.criado_em desc
             limit 1)
      from public.profiles p
      where v_termo = ''
         or p.email ilike '%' || v_termo || '%'
         or p.apelido ilike '%' || v_termo || '%'
      order by p.created_at desc
      limit case when v_termo = '' then 20 else 50 end;
end;
$$;

revoke all on function public.admin_buscar_usuarios(text) from public, anon;
grant execute on function public.admin_buscar_usuarios(text) to authenticated;

-- Ajusta plano e saldo de uma conta. Sempre com motivo; grava o antes e o
-- depois em admin_auditoria (quem fez e quando).
--   p_plano: gratis | solo | pro.
--   p_valido_ate: último dia do plano pago (inclusive). Vazio num plano
--     pago = sem data de fim (cortesia). No Grátis é ignorado.
-- Atenção: se a pessoa tem assinatura ativa no Asaas, a próxima
-- mensalidade paga volta o plano e o saldo ao que foi pago.
create or replace function public.admin_ajustar_conta(
  p_user_id uuid,
  p_plano text,
  p_creditos integer,
  p_buscas integer,
  p_valido_ate date,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes public.profiles%rowtype;
  v_depois public.profiles%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_valido timestamptz;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  if p_plano is null or p_plano not in ('gratis', 'solo', 'pro') then
    raise exception 'Plano inválido.';
  end if;
  if p_creditos is null or p_creditos < 0 or p_creditos > 100000 then
    raise exception 'Desbloqueios: use um número de 0 a 100000.';
  end if;
  if p_buscas is null or p_buscas < 0 or p_buscas > 100000 then
    raise exception 'Buscas: use um número de 0 a 100000.';
  end if;
  if v_motivo is null or char_length(v_motivo) < 3 then
    raise exception 'Escreva o motivo do ajuste (fica registrado na auditoria).';
  end if;
  if char_length(v_motivo) > 500 then
    raise exception 'O motivo pode ter no máximo 500 caracteres.';
  end if;

  if p_plano = 'gratis' or p_valido_ate is null then
    v_valido := null;
  else
    if p_valido_ate < (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'A data de validade não pode estar no passado.';
    end if;
    -- Vale até o fim do dia escolhido, no horário de Brasília.
    v_valido := (p_valido_ate + 1)::timestamp at time zone 'America/Sao_Paulo';
  end if;

  select * into v_antes from public.profiles where id = p_user_id for update;
  if v_antes.id is null then
    raise exception 'Conta não encontrada.';
  end if;

  if v_antes.plano = p_plano
     and v_antes.creditos_desbloqueio = p_creditos
     and v_antes.buscas_restantes = p_buscas
     and v_antes.plano_valido_ate is not distinct from v_valido then
    raise exception 'Nada mudou: os valores são iguais aos atuais.';
  end if;

  update public.profiles
     set plano = p_plano,
         creditos_desbloqueio = p_creditos,
         buscas_restantes = p_buscas,
         plano_valido_ate = v_valido
   where id = p_user_id
   returning * into v_depois;

  perform public.registrar_auditoria(
    'ajuste_conta',
    p_user_id,
    jsonb_build_object(
      'plano', v_antes.plano,
      'creditos_desbloqueio', v_antes.creditos_desbloqueio,
      'buscas_restantes', v_antes.buscas_restantes,
      'plano_valido_ate', v_antes.plano_valido_ate
    ),
    jsonb_build_object(
      'plano', v_depois.plano,
      'creditos_desbloqueio', v_depois.creditos_desbloqueio,
      'buscas_restantes', v_depois.buscas_restantes,
      'plano_valido_ate', v_depois.plano_valido_ate
    ),
    v_motivo
  );

  return jsonb_build_object(
    'plano', v_depois.plano,
    'creditos_desbloqueio', v_depois.creditos_desbloqueio,
    'buscas_restantes', v_depois.buscas_restantes,
    'plano_valido_ate', v_depois.plano_valido_ate
  );
end;
$$;

revoke all on function public.admin_ajustar_conta(uuid, text, integer, integer, date, text) from public, anon;
grant execute on function public.admin_ajustar_conta(uuid, text, integer, integer, date, text) to authenticated;

notify pgrst, 'reload schema';
