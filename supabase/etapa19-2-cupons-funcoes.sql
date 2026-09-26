-- Ártemis Prospect — Etapa 19, parte 2 de 2: funções dos cupons
-- (administrador, assinante, servidor e aviso no sino)
-- Rode DEPOIS da parte 1 (etapa19-1-cupons-base.sql), inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).

-- 1. Conferir um cupom para um usuário e um plano (uso interno) -------------
-- Devolve o preço cheio e o preço com desconto, ou recusa com uma mensagem
-- que pode ser mostrada na tela. Com p_travar = true, trava o cupom até
-- o fim da transação: dois usos ao mesmo tempo não furam os limites.
create or replace function public.conferir_cupom_interno(
  p_user_id uuid,
  p_codigo text,
  p_plano text,
  p_travar boolean default false,
  out cupom_id bigint,
  out codigo text,
  out tipo_desconto text,
  out valor_desconto numeric,
  out duracao_meses integer,
  out valor_cheio numeric,
  out valor_final numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cupom public.cupons%rowtype;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_usos integer;
begin
  if p_plano is null or p_plano not in ('solo', 'pro') then
    raise exception 'Escolha o plano Solo ou Pro.';
  end if;
  if v_codigo !~ '^[A-Z0-9_-]{3,30}$' then
    raise exception 'Cupom não encontrado. Confira se digitou certo.';
  end if;

  if p_travar then
    select * into v_cupom from public.cupons c where c.codigo = v_codigo for update;
  else
    select * into v_cupom from public.cupons c where c.codigo = v_codigo;
  end if;

  if v_cupom.id is null then
    raise exception 'Cupom não encontrado. Confira se digitou certo.';
  end if;
  if not v_cupom.ativo then
    raise exception 'Este cupom está pausado no momento.';
  end if;
  if v_hoje < v_cupom.inicio_em then
    raise exception 'Este cupom só começa a valer em %.', to_char(v_cupom.inicio_em, 'DD/MM/YYYY');
  end if;
  if v_hoje > v_cupom.fim_em then
    raise exception 'Este cupom expirou.';
  end if;
  if not (p_plano = any (v_cupom.planos)) then
    raise exception 'Este cupom não vale para o plano %.', initcap(p_plano);
  end if;

  if v_cupom.so_novos and exists (
    select 1 from public.cobrancas cb
     where cb.user_id = p_user_id
       and cb.tipo = 'assinatura'
       and cb.creditado_em is not null
  ) then
    raise exception 'Este cupom é só para quem ainda não assinou nenhum plano.';
  end if;

  -- Usos que contam: todos, menos assinaturas canceladas sem nenhuma
  -- mensalidade paga (a pessoa desistiu antes de pagar).
  if v_cupom.limite_total is not null then
    select count(*) into v_usos from public.cupom_usos u
     where u.cupom_id = v_cupom.id
       and not (u.status = 'cancelado' and u.ciclos_pagos = 0);
    if v_usos >= v_cupom.limite_total then
      raise exception 'Este cupom esgotou.';
    end if;
  end if;

  select count(*) into v_usos from public.cupom_usos u
   where u.cupom_id = v_cupom.id
     and u.user_id = p_user_id
     and not (u.status = 'cancelado' and u.ciclos_pagos = 0);
  if v_usos >= v_cupom.limite_por_usuario then
    raise exception 'Você já usou este cupom o máximo de vezes permitido.';
  end if;

  cupom_id := v_cupom.id;
  codigo := v_cupom.codigo;
  tipo_desconto := v_cupom.tipo_desconto;
  valor_desconto := v_cupom.valor_desconto;
  duracao_meses := v_cupom.duracao_meses;
  valor_cheio := public.preco_do_plano(p_plano);
  valor_final := public.preco_com_cupom(valor_cheio, v_cupom.tipo_desconto, v_cupom.valor_desconto);

  -- Trava de segurança também na hora do uso: se você subiu o piso depois
  -- de criar o cupom, ele deixa de ser aceito.
  if valor_final is null or valor_final < public.piso_cupons()
     or (p_plano = 'pro' and valor_final = public.preco_do_plano('solo')) then
    raise exception 'Este cupom não pode ser usado no momento.';
  end if;
end;
$$;

revoke all on function public.conferir_cupom_interno(uuid, text, text, boolean) from public, anon, authenticated;

-- 2. Para o assinante: ver o preço com o cupom antes de assinar ---------------
-- Só mostra; não reserva nada. O preço que vai para o Asaas é
-- recalculado pelo servidor na hora de assinar.
create or replace function public.conferir_cupom(p_codigo text, p_plano text)
returns table (
  codigo text,
  plano text,
  valor_cheio numeric,
  valor_final numeric,
  duracao_meses integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;
  select * into v from public.conferir_cupom_interno(auth.uid(), p_codigo, p_plano, false);
  return query select v.codigo, p_plano, v.valor_cheio, v.valor_final, v.duracao_meses;
end;
$$;

revoke all on function public.conferir_cupom(text, text) from public, anon;
grant execute on function public.conferir_cupom(text, text) to authenticated;

-- Para a tela "Meu plano": o desconto da assinatura atual, se houver.
create or replace function public.meu_desconto()
returns table (
  codigo text,
  plano text,
  valor_cheio numeric,
  valor_com_desconto numeric,
  duracao_meses integer,
  ciclos_pagos integer,
  status text,
  proxima_cobranca_cheia date
)
language sql
stable
security definer
set search_path = public
as $$
  select c.codigo, u.plano, u.valor_cheio, u.valor_com_desconto, u.duracao_meses,
         u.ciclos_pagos, u.status, u.proxima_cobranca_cheia
    from public.cupom_usos u
    join public.cupons c on c.id = u.cupom_id
    join public.assinaturas a on a.asaas_subscription_id = u.asaas_subscription_id
   where u.user_id = auth.uid()
     and a.status <> 'cancelada'
     and u.status in ('ativo', 'voltando')
   order by u.criado_em desc
   limit 1;
$$;

revoke all on function public.meu_desconto() from public, anon;
grant execute on function public.meu_desconto() to authenticated;

-- 3. Para o servidor: registrar a assinatura criada com cupom ---------------
-- Chamada pela rota /api/plano/assinar DEPOIS de criar a assinatura no
-- Asaas com o valor com desconto. Confere tudo de novo com o cupom
-- travado; se algo mudou (esgotou, pausou, valor diferente), recusa e a
-- rota cancela a assinatura no Asaas.
create or replace function public.registrar_assinatura_com_cupom(
  p_user_id uuid,
  p_subscription_id text,
  p_plano text,
  p_forma text,
  p_link text,
  p_codigo text,
  p_valor numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select * into v from public.conferir_cupom_interno(p_user_id, p_codigo, p_plano, true);

  if v.valor_final <> p_valor then
    raise exception 'O desconto deste cupom mudou agora há pouco. Confira o novo valor e tente de novo.';
  end if;

  perform public.registrar_assinatura(p_user_id, p_subscription_id, p_plano, p_forma, p_link);

  insert into public.cupom_usos (
    cupom_id, user_id, asaas_subscription_id, plano, tipo_desconto, valor_desconto,
    duracao_meses, valor_cheio, valor_com_desconto
  ) values (
    v.cupom_id, p_user_id, p_subscription_id, p_plano, v.tipo_desconto, v.valor_desconto,
    v.duracao_meses, v.valor_cheio, v.valor_final
  );
end;
$$;

revoke all on function public.registrar_assinatura_com_cupom(uuid, text, text, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.registrar_assinatura_com_cupom(uuid, text, text, text, text, text, numeric) to service_role;

-- 4. Troca de plano com desconto em andamento --------------------------------
-- Valor da mensalidade de uma assinatura num plano: com o desconto do
-- cupom se ele ainda vale e cobre esse plano; senão, o preço cheio.
create or replace function public.valor_mensalidade(p_subscription_id text, p_plano text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uso public.cupom_usos%rowtype;
  v_planos text[];
  v_cheio numeric := public.preco_do_plano(p_plano);
  v_final numeric;
begin
  select * into v_uso from public.cupom_usos
   where asaas_subscription_id = p_subscription_id and status = 'ativo';
  if v_uso.id is null then
    return v_cheio;
  end if;
  select planos into v_planos from public.cupons where id = v_uso.cupom_id;
  if not (p_plano = any (v_planos)) then
    return v_cheio;
  end if;
  v_final := public.preco_com_cupom(v_cheio, v_uso.tipo_desconto, v_uso.valor_desconto);
  if v_final is null or v_final < public.piso_cupons()
     or (p_plano = 'pro' and v_final = public.preco_do_plano('solo')) then
    return v_cheio;
  end if;
  return v_final;
end;
$$;

revoke all on function public.valor_mensalidade(text, text) from public, anon, authenticated;
grant execute on function public.valor_mensalidade(text, text) to service_role;

-- Mesma função da etapa 3, agora também acertando o uso do cupom: se o
-- desconto continua valendo no plano novo, anota o novo preço; se não,
-- o desconto termina (a rota já mandou o preço cheio para o Asaas).
create or replace function public.agendar_troca_plano(
  p_user_id uuid,
  p_subscription_id text,
  p_plano text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor numeric := public.valor_mensalidade(p_subscription_id, p_plano);
  v_cheio numeric := public.preco_do_plano(p_plano);
begin
  update public.assinaturas
    set plano = p_plano, atualizado_em = now()
    where user_id = p_user_id and asaas_subscription_id = p_subscription_id;

  if v_valor < v_cheio then
    update public.cupom_usos
      set plano = p_plano, valor_cheio = v_cheio, valor_com_desconto = v_valor
      where asaas_subscription_id = p_subscription_id and status = 'ativo';
  else
    update public.cupom_usos
      set status = 'encerrado',
          motivo_fim = 'troca_de_plano',
          encerrado_em = coalesce(encerrado_em, now()),
          preco_normal_em = now()
      where asaas_subscription_id = p_subscription_id
        and status in ('ativo', 'voltando');
  end if;
end;
$$;

revoke all on function public.agendar_troca_plano(uuid, text, text) from public, anon, authenticated;
grant execute on function public.agendar_troca_plano(uuid, text, text) to service_role;

-- 5. Volta ao preço normal -------------------------------------------------
-- Lista as assinaturas cujo desconto acabou e que ainda estão com o valor
-- antigo no Asaas. O servidor muda o valor lá (webhook, logo depois do
-- pagamento do último mês com desconto, e a rotina diária, como reserva)
-- e depois chama marcar_preco_normal.
create or replace function public.cupons_para_voltar_preco()
returns table (uso_id bigint, asaas_subscription_id text, plano text, valor numeric)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.asaas_subscription_id, a.plano, public.preco_do_plano(a.plano)
    from public.cupom_usos u
    join public.assinaturas a on a.asaas_subscription_id = u.asaas_subscription_id
   where u.status = 'voltando'
     and a.status <> 'cancelada'
   order by u.encerrado_em
   limit 100;
$$;

create or replace function public.marcar_preco_normal(p_uso_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.cupom_usos
     set status = 'encerrado', preco_normal_em = now()
   where id = p_uso_id and status = 'voltando';
$$;

revoke all on function public.cupons_para_voltar_preco() from public, anon, authenticated;
revoke all on function public.marcar_preco_normal(bigint) from public, anon, authenticated;
grant execute on function public.cupons_para_voltar_preco() to service_role;
grant execute on function public.marcar_preco_normal(bigint) to service_role;

-- 6. Aviso no sino uma semana antes de o desconto acabar ---------------------
-- Chamada pela rotina diária (/api/cron/notificacoes). Avisa quando
-- faltam 7 dias ou menos para a primeira mensalidade no preço normal.
-- Uma vez só por assinatura; rodar de novo no mesmo dia não duplica.
create or replace function public.gerar_notificacoes_cupom()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_total integer := 0;
begin
  with candidatos as (
    select u.user_id,
           'cupom-fim:' || u.id as chave,
           format('Seu desconto do cupom %s está terminando', c.codigo) as titulo,
           format(
             'A partir da renovação de %s, sua assinatura do plano %s volta ao preço normal de R$ %s por mês (hoje você paga R$ %s). Nada muda no seu plano nem no seu saldo. Se preferir, dá para trocar de plano ou cancelar em Meu plano.',
             to_char(u.proxima_cobranca_cheia, 'DD/MM'),
             initcap(a.plano),
             replace(to_char(public.preco_do_plano(a.plano), 'FM999990.00'), '.', ','),
             replace(to_char(u.valor_com_desconto, 'FM999990.00'), '.', ',')
           ) as texto
      from public.cupom_usos u
      join public.cupons c on c.id = u.cupom_id
      join public.assinaturas a on a.asaas_subscription_id = u.asaas_subscription_id
     where u.status in ('voltando', 'encerrado')
       and u.motivo_fim = 'duracao'
       and a.status <> 'cancelada'
       and u.proxima_cobranca_cheia is not null
       and u.proxima_cobranca_cheia - v_hoje between 1 and 7
  ),
  registradas as (
    insert into public.notificacoes_enviadas (user_id, chave)
    select user_id, chave from candidatos
    on conflict do nothing
    returning user_id, chave
  )
  insert into public.notificacoes (user_id, tipo, titulo, texto, link)
  select c.user_id, 'renovacao', c.titulo, c.texto, '/painel/plano'
    from candidatos c
    join registradas r using (user_id, chave);
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke all on function public.gerar_notificacoes_cupom() from public, anon, authenticated;
grant execute on function public.gerar_notificacoes_cupom() to service_role;

-- 7. Gestão > Promoções: listar cupons com os resultados --------------------
--   usos: assinaturas criadas com o cupom (sem contar quem desistiu
--         antes de pagar a primeira);
--   assinantes: quantas dessas pagaram ao menos uma mensalidade;
--   ativos: assinaturas com o cupom que continuam ativas hoje;
--   desconto_concedido: soma dos descontos já pagos (sem estornos);
--   receita: tudo que essas assinaturas já pagaram (sem estornos).
create or replace function public.admin_listar_cupons()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_piso numeric := public.piso_cupons();
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  return jsonb_build_object(
    'piso', v_piso,
    'cupons', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.criado_em desc)
        from (
          select c.id, c.codigo, c.tipo_desconto, c.valor_desconto, c.duracao_meses, c.planos,
                 c.inicio_em, c.fim_em, c.limite_total, c.limite_por_usuario, c.so_novos,
                 c.ativo, c.criado_em, c.atualizado_em,
                 (select count(*) from public.cupom_usos u
                   where u.cupom_id = c.id
                     and not (u.status = 'cancelado' and u.ciclos_pagos = 0)) as usos,
                 (select count(*) from public.cupom_usos u
                   where u.cupom_id = c.id and u.ciclos_pagos > 0) as assinantes,
                 (select count(*) from public.cupom_usos u
                    join public.assinaturas a on a.asaas_subscription_id = u.asaas_subscription_id
                   where u.cupom_id = c.id and u.ciclos_pagos > 0 and a.status <> 'cancelada') as ativos,
                 (select coalesce(sum(d.desconto), 0) from public.cupom_descontos d
                    join public.cupom_usos u on u.id = d.uso_id
                   where u.cupom_id = c.id and not d.estornado) as desconto_concedido,
                 (select coalesce(sum(cb.valor), 0) from public.cobrancas cb
                    join public.cupom_usos u on u.asaas_subscription_id = cb.asaas_subscription_id
                   where u.cupom_id = c.id
                     and cb.creditado_em is not null
                     and cb.estornado_em is null) as receita,
                 exists (
                   select 1 from unnest(c.planos) p
                    where public.preco_com_cupom(public.preco_do_plano(p), c.tipo_desconto, c.valor_desconto) < v_piso
                 ) as abaixo_do_piso
            from public.cupons c
        ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_listar_cupons() from public, anon;
grant execute on function public.admin_listar_cupons() to authenticated;

-- 8. Criar ou editar um cupom ------------------------------------------------
-- p_id nulo = cupom novo. O código não muda depois de criado. Mudanças no
-- desconto valem só para quem usar o cupom daqui em diante.
create or replace function public.admin_salvar_cupom(
  p_id bigint,
  p_codigo text,
  p_tipo text,
  p_valor numeric,
  p_duracao integer,
  p_planos text[],
  p_inicio date,
  p_fim date,
  p_limite_total integer,
  p_limite_usuario integer,
  p_so_novos boolean,
  p_ativo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_planos text[];
  v_antes public.cupons%rowtype;
  v_depois public.cupons%rowtype;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  if p_tipo is null or p_tipo not in ('percentual', 'fixo') then
    raise exception 'Escolha o tipo de desconto: percentual ou valor fixo.';
  end if;
  if p_valor is null or p_valor <= 0 or p_valor <> round(p_valor, 2) then
    raise exception 'Informe o desconto (maior que zero, até 2 casas decimais).';
  end if;
  if p_tipo = 'percentual' and p_valor > 100 then
    raise exception 'O desconto percentual vai de 1 a 100.';
  end if;
  if p_duracao is not null and p_duracao not in (1, 3) then
    raise exception 'Duração inválida.';
  end if;
  select array_agg(distinct p order by p) into v_planos from unnest(p_planos) p;
  if v_planos is null or not (v_planos <@ array['solo', 'pro']::text[]) then
    raise exception 'Escolha em quais planos o cupom vale.';
  end if;
  if p_inicio is null or p_fim is null then
    raise exception 'Informe a data de início e a de fim.';
  end if;
  if p_fim < p_inicio then
    raise exception 'A data de fim não pode ser antes da de início.';
  end if;
  if p_limite_total is not null and (p_limite_total < 1 or p_limite_total > 1000000) then
    raise exception 'Limite total: use um número a partir de 1 (ou deixe em branco para sem limite).';
  end if;
  if p_limite_usuario is null or p_limite_usuario < 1 or p_limite_usuario > 100 then
    raise exception 'Limite por usuário: use um número de 1 a 100.';
  end if;

  -- A trava de segurança: preço final nunca abaixo do piso.
  perform public.validar_desconto_cupom(p_tipo, p_valor, v_planos);

  if p_id is null then
    if v_codigo !~ '^[A-Z0-9_-]{3,30}$' then
      raise exception 'Código inválido: use de 3 a 30 letras, números, "-" ou "_", sem espaço nem acento.';
    end if;
    if exists (select 1 from public.cupons where codigo = v_codigo) then
      raise exception 'Já existe um cupom com o código %.', v_codigo;
    end if;
    if p_fim < (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'A data de fim já passou.';
    end if;

    insert into public.cupons (
      codigo, tipo_desconto, valor_desconto, duracao_meses, planos, inicio_em, fim_em,
      limite_total, limite_por_usuario, so_novos, ativo, criado_por
    ) values (
      v_codigo, p_tipo, p_valor, p_duracao, v_planos, p_inicio, p_fim,
      p_limite_total, p_limite_usuario, coalesce(p_so_novos, false), coalesce(p_ativo, true), auth.uid()
    )
    returning * into v_depois;

    perform public.registrar_auditoria('cupom_criado', null, null, to_jsonb(v_depois), null);
  else
    select * into v_antes from public.cupons where id = p_id for update;
    if v_antes.id is null then
      raise exception 'Cupom não encontrado.';
    end if;

    update public.cupons
       set tipo_desconto = p_tipo,
           valor_desconto = p_valor,
           duracao_meses = p_duracao,
           planos = v_planos,
           inicio_em = p_inicio,
           fim_em = p_fim,
           limite_total = p_limite_total,
           limite_por_usuario = p_limite_usuario,
           so_novos = coalesce(p_so_novos, false),
           ativo = coalesce(p_ativo, v_antes.ativo),
           atualizado_em = now()
     where id = p_id
     returning * into v_depois;

    if to_jsonb(v_antes) - 'atualizado_em' = to_jsonb(v_depois) - 'atualizado_em' then
      raise exception 'Nada mudou: os valores são iguais aos atuais.';
    end if;

    perform public.registrar_auditoria('cupom_editado', null, to_jsonb(v_antes), to_jsonb(v_depois), null);
  end if;

  return to_jsonb(v_depois);
end;
$$;

revoke all on function public.admin_salvar_cupom(bigint, text, text, numeric, integer, text[], date, date, integer, integer, boolean, boolean) from public, anon;
grant execute on function public.admin_salvar_cupom(bigint, text, text, numeric, integer, text[], date, date, integer, integer, boolean, boolean) to authenticated;

-- 9. Pausar ou reativar ------------------------------------------------------
-- Pausar não mexe em quem já assinou: o desconto combinado continua.
-- Ao reativar, confere de novo o piso (ele pode ter subido).
create or replace function public.admin_pausar_cupom(p_id bigint, p_ativo boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes public.cupons%rowtype;
  v_depois public.cupons%rowtype;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;
  if p_ativo is null then
    raise exception 'Pedido inválido.';
  end if;

  select * into v_antes from public.cupons where id = p_id for update;
  if v_antes.id is null then
    raise exception 'Cupom não encontrado.';
  end if;
  if v_antes.ativo = p_ativo then
    raise exception 'O cupom já está %.', case when p_ativo then 'ativo' else 'pausado' end;
  end if;
  if p_ativo then
    perform public.validar_desconto_cupom(v_antes.tipo_desconto, v_antes.valor_desconto, v_antes.planos);
  end if;

  update public.cupons set ativo = p_ativo, atualizado_em = now()
   where id = p_id
   returning * into v_depois;

  perform public.registrar_auditoria(
    case when p_ativo then 'cupom_reativado' else 'cupom_pausado' end,
    null,
    jsonb_build_object('cupom_id', v_antes.id, 'codigo', v_antes.codigo, 'ativo', v_antes.ativo),
    jsonb_build_object('cupom_id', v_depois.id, 'codigo', v_depois.codigo, 'ativo', v_depois.ativo),
    null
  );
  return to_jsonb(v_depois);
end;
$$;

revoke all on function public.admin_pausar_cupom(bigint, boolean) from public, anon;
grant execute on function public.admin_pausar_cupom(bigint, boolean) to authenticated;

-- 10. Definir o piso -----------------------------------------------------------
-- Cupons que ficarem abaixo do novo piso param de ser aceitos na hora
-- (a tela mostra quais são). Quem já assinou não é afetado.
create or replace function public.admin_definir_piso_cupons(p_valor numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes numeric;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;
  if p_valor is null or p_valor < 5 or p_valor > 69.90 or p_valor <> round(p_valor, 2) then
    raise exception 'O piso vai de R$ 5,00 (mínimo do Asaas) a R$ 69,90 (preço do Pro).';
  end if;

  select piso_minimo into v_antes from public.cupons_config where id for update;
  if v_antes = p_valor then
    raise exception 'Nada mudou: o piso já é esse.';
  end if;

  update public.cupons_config set piso_minimo = p_valor, atualizado_em = now() where id;

  perform public.registrar_auditoria(
    'cupom_piso_alterado', null,
    jsonb_build_object('piso_minimo', v_antes),
    jsonb_build_object('piso_minimo', p_valor),
    null
  );
  return p_valor;
end;
$$;

revoke all on function public.admin_definir_piso_cupons(numeric) from public, anon;
grant execute on function public.admin_definir_piso_cupons(numeric) to authenticated;

notify pgrst, 'reload schema';
