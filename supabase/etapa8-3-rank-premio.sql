-- Caça-leads — Etapa 8, parte 3 de 3: rank mensal e prêmio do mês
-- Rode DEPOIS da parte 2 (etapa8-2-comprovante-admin.sql), inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Dica: copie pelo botão "Copy raw file" do GitHub (ou abra o arquivo
-- no editor e use Ctrl+A). Se a cópia vier cortada, o Supabase acusa
-- erro de sintaxe numa linha do meio, como "syntax error at or near".

-- Depois desta parte, cadastre você como administrador (passo 14, no fim
-- do arquivo) — é um comando separado, com o seu e-mail.

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
