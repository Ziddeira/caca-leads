-- Caça-leads — Etapa 10: lembrete de retorno ("Agendar retorno")
-- Rode isto DEPOIS de todos os scripts anteriores (até a etapa 9),
-- inteiro, de uma vez: Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- O que esta etapa faz:
--   * guarda em cada lead a data/hora do retorno e uma observação curta;
--   * cria a função "agendar_retorno_lead", a única porta de escrita
--     desses campos (o usuário continua sem poder escrever direto em
--     "leads_desbloqueados");
--   * cria a rotina "gerar_notificacoes_retorno", que põe no sino um
--     aviso no dia do retorno. Ela é chamada pela mesma rotina diária da
--     Vercel que já gera as outras notificações (/api/cron/notificacoes).
--
-- Datas e horários sempre no horário de Brasília (America/Sao_Paulo).

-- 1. Colunas do retorno em cada lead ----------------------------------------
-- retorno_em: dia e hora do retorno. Nulo = sem retorno marcado.
-- retorno_obs: observação opcional, até 200 caracteres.
alter table public.leads_desbloqueados
  add column if not exists retorno_em timestamptz,
  add column if not exists retorno_obs text;

alter table public.leads_desbloqueados
  drop constraint if exists leads_desbloqueados_retorno_obs_tamanho;
alter table public.leads_desbloqueados
  add constraint leads_desbloqueados_retorno_obs_tamanho check (
    retorno_obs is null or char_length(retorno_obs) <= 200
  );

-- Para o filtro "Retornos" e para a rotina do sino achar rápido os
-- retornos do dia.
create index if not exists leads_desbloqueados_retorno_idx
  on public.leads_desbloqueados (retorno_em)
  where retorno_em is not null;

-- O SELECT dessas colunas já está coberto pelo GRANT e pela política de
-- RLS da etapa 2 (cada usuário vê só as próprias linhas). Cinto de
-- segurança extra, caso algum GRANT amplo seja aplicado por engano:
revoke insert, update, delete on public.leads_desbloqueados from authenticated, anon;

-- 2. Função "agendar_retorno_lead" -----------------------------------------
-- Marca (ou troca) o retorno de um lead do próprio usuário.
--   p_data e p_hora: dia e hora no horário de Brasília.
--   p_observacao: opcional, até 200 caracteres.
-- Com p_data nulo, APAGA o retorno (e a observação).
-- Regras: o retorno precisa ser no futuro e no máximo 1 ano à frente.
-- Devolve a data/hora gravada (ou nulo, quando apagou).
create or replace function public.agendar_retorno_lead(
  p_place_id text,
  p_data date,
  p_hora time,
  p_observacao text
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quando timestamptz;
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  if p_data is null then
    update public.leads_desbloqueados
      set retorno_em = null,
          retorno_obs = null
      where user_id = auth.uid() and place_id = p_place_id;
    if not found then
      raise exception 'Esse lead não está entre os seus desbloqueados.';
    end if;
    return null;
  end if;

  if p_hora is null then
    raise exception 'Informe o horário do retorno.';
  end if;

  if char_length(v_obs) > 200 then
    raise exception 'A observação pode ter no máximo 200 caracteres.';
  end if;

  -- "dia + hora" lidos como horário de Brasília.
  v_quando := (p_data + p_hora) at time zone 'America/Sao_Paulo';

  if v_quando <= now() then
    raise exception 'Escolha um dia e horário que ainda não passaram.';
  end if;

  if v_quando > now() + interval '1 year' then
    raise exception 'O retorno pode ser marcado para no máximo 1 ano à frente.';
  end if;

  update public.leads_desbloqueados
    set retorno_em = v_quando,
        retorno_obs = v_obs
    where user_id = auth.uid() and place_id = p_place_id;

  if not found then
    raise exception 'Esse lead não está entre os seus desbloqueados.';
  end if;

  return v_quando;
end;
$$;

revoke all on function public.agendar_retorno_lead(text, date, time, text) from public, anon;
grant execute on function public.agendar_retorno_lead(text, date, time, text) to authenticated;

-- 3. Novo tipo de notificação: "retorno" ------------------------------------
-- A tabela da etapa 9 só aceitava renovacao | saldo | novidade | incentivo.
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes drop constraint if exists notificacoes_tipo_valido;
alter table public.notificacoes
  add constraint notificacoes_tipo_valido check (
    tipo in ('renovacao', 'saldo', 'novidade', 'incentivo', 'retorno')
  );

-- 4. Rotina "gerar_notificacoes_retorno" ------------------------------------
-- Um aviso por usuário no dia em que ele tem retorno(s) marcado(s).
-- Com um retorno só, o aviso diz o nome da empresa e a hora; com vários,
-- lista os primeiros em ordem de horário.
-- Chave de repetição: 'retorno:<dia>' — rodar duas vezes no mesmo dia
-- não duplica nada, e apagar o aviso não faz ele voltar.
-- Só o servidor (papel "service_role") pode chamar. Para testar na mão,
-- no SQL Editor:  select public.gerar_notificacoes_retorno();
create or replace function public.gerar_notificacoes_retorno()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_total integer := 0;
begin
  -- Uma rodada por vez: se outra estiver rodando, esta não faz nada.
  if not pg_try_advisory_xact_lock(hashtext('public.gerar_notificacoes_retorno')) then
    return jsonb_build_object('ignorada', true);
  end if;

  with retornos as (
    select l.user_id,
           -- O nome vem do cache do lead (etapa 4), quando existe.
           left(to_jsonb(l) -> 'dados' ->> 'nome', 60) as nome,
           to_char(l.retorno_em at time zone 'America/Sao_Paulo', 'HH24:MI') as hora,
           l.retorno_obs as obs,
           row_number() over (partition by l.user_id order by l.retorno_em) as ordem,
           count(*) over (partition by l.user_id) as qtd
      from public.leads_desbloqueados l
      where l.retorno_em is not null
        and (l.retorno_em at time zone 'America/Sao_Paulo')::date = v_hoje
  ),
  por_usuario as (
    select user_id,
           max(qtd) as qtd,
           max(nome) filter (where ordem = 1) as nome,
           max(hora) filter (where ordem = 1) as hora,
           max(obs) filter (where ordem = 1) as obs,
           string_agg(coalesce(nome, 'lead sem nome') || ' (' || hora || ')', ', ' order by ordem)
             filter (where ordem <= 5) as lista
      from retornos
      group by user_id
  ),
  candidatos as (
    select user_id,
           'retorno:' || v_hoje::text as chave,
           case when qtd = 1
             then case when nome is null
                    then format('Você tem um retorno hoje, às %s', hora)
                    else format('Retorno hoje, às %s: %s', hora, nome) end
             else format('Você tem %s retornos agendados para hoje', qtd)
           end as titulo,
           left(
             case when qtd = 1
               then 'Hora de falar de novo com esse lead.'
                    || case when obs is not null then format(' Sua observação: “%s”.', obs) else '' end
                    || ' O telefone e o WhatsApp estão em Meus leads, no filtro Retornos.'
               else format('Em ordem de horário: %s%s.', lista,
                           case when qtd > 5 then format(' e mais %s', qtd - 5) else '' end)
                    || ' Veja todos em Meus leads, no filtro Retornos.'
             end,
             600
           ) as texto
      from por_usuario
  ),
  registradas as (
    insert into public.notificacoes_enviadas (user_id, chave)
    select user_id, chave from candidatos
    on conflict do nothing
    returning user_id, chave
  )
  insert into public.notificacoes (user_id, tipo, titulo, texto, link)
  select c.user_id, 'retorno', c.titulo, c.texto, '/painel/meus-leads'
    from candidatos c
    join registradas r using (user_id, chave);
  get diagnostics v_total = row_count;

  return jsonb_build_object('retorno', v_total);
end;
$$;

revoke all on function public.gerar_notificacoes_retorno() from public, anon, authenticated;
grant execute on function public.gerar_notificacoes_retorno() to service_role;

-- 5. Avisa a API do Supabase (PostgREST) para reler as tabelas e funções.
-- Sem isso, às vezes o site continua sem enxergar as colunas e funções
-- novas por alguns minutos.
notify pgrst, 'reload schema';
