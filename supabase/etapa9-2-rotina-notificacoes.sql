-- Ártemis Prospect — Etapa 9 (parte 2 de 2): a rotina que gera as notificações
-- Rode isto DEPOIS da parte 1 (etapa9-1-notificacoes.sql), inteiro, de
-- uma vez: Supabase > SQL Editor > New query > cole tudo > Run.
--
-- A função "gerar_notificacoes" é chamada uma vez por dia pela rotina
-- agendada da Vercel (/api/cron/notificacoes). Só o servidor (papel
-- "service_role") pode chamá-la; você também pode rodar na mão, no SQL
-- Editor, com:  select public.gerar_notificacoes();
-- Rodar duas vezes no mesmo dia não duplica nada.
--
-- O que ela gera (datas sempre no horário de Brasília):
--   a) Renovação: quando faltam 3 dias ou menos para o fim do ciclo pago.
--      Uma vez por ciclo.
--   b) Saldo: quando restam 3 buscas ou menos, e quando restam 5
--      desbloqueios ou menos. Uma vez por ciclo cada (o ciclo muda na
--      renovação; no plano Grátis, que não renova, é uma vez só). Só
--      conta depois que o usuário gastou algo: quem está com o saldo
--      cheio do Grátis (3 buscas) não recebe aviso logo no cadastro.
--   c) Novidades: cada linha nova da tabela "novidades" vai para todos.
--   d) Incentivo, baseado no que o usuário realmente fez, no máximo UM
--      por dia, nesta ordem de prioridade:
--        1. venda pendente de verificação há mais de 7 dias;
--        2. lead em negociação parado há mais de 7 dias;
--        3. lead desbloqueado há mais de 3 dias ainda sem contato.
--      O mesmo tipo de incentivo não se repete em menos de 7 dias (para
--      não virar cobrança diária); se o 1º já foi mandado essa semana,
--      a rotina tenta o 2º, e assim por diante.

create or replace function public.gerar_notificacoes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_renovacao integer := 0;
  v_saldo integer := 0;
  v_novidade integer := 0;
  v_incentivo integer := 0;
begin
  -- Uma rodada por vez: se outra estiver rodando, esta não faz nada.
  if not pg_try_advisory_xact_lock(hashtext('public.gerar_notificacoes')) then
    return jsonb_build_object('ignorada', true);
  end if;

  -- Em todos os blocos abaixo o caminho é o mesmo:
  --   candidatos  → quem deveria receber, com a "chave" do aviso;
  --   registradas → grava a chave em notificacoes_enviadas; se ela já
  --                 existia, o usuário já recebeu e fica de fora;
  --   insert      → cria a notificação só para quem passou.

  -- a) Renovação do plano -----------------------------------------------------
  with candidatos as (
    select p.id as user_id,
           'renovacao:' || x.fim::text as chave,
           case when x.renova
             then format('Seu plano %s renova %s', initcap(p.plano), x.quando)
             else format('Seu plano %s termina %s', initcap(p.plano), x.quando)
           end as titulo,
           case when x.renova
             then format(
               'A renovação é em %s. Quando o pagamento for confirmado, suas buscas e desbloqueios voltam ao limite do plano — o que sobrar agora não acumula, então vale usar antes.',
               to_char(x.fim, 'DD/MM'))
             else format(
               'Seu plano vale até %s e a assinatura está cancelada. Depois disso, a conta volta ao plano Grátis. Para continuar, assine de novo em Meu plano.',
               to_char(x.fim, 'DD/MM'))
           end as texto
      from public.profiles p
      cross join lateral (
        select (p.plano_valido_ate at time zone 'America/Sao_Paulo')::date as fim,
               ((p.plano_valido_ate at time zone 'America/Sao_Paulo')::date - v_hoje) as dias,
               exists (
                 select 1 from public.assinaturas a
                  where a.user_id = p.id and a.status <> 'cancelada'
               ) as renova
      ) d
      cross join lateral (
        select d.fim, d.renova,
               case when d.dias = 1 then 'amanhã' else format('em %s dias', d.dias) end as quando
      ) x
      where p.plano <> 'gratis'
        and p.plano_valido_ate is not null
        and d.dias between 1 and 3
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
  get diagnostics v_renovacao = row_count;

  -- b) Saldo baixo de buscas e de desbloqueios --------------------------------
  -- "ciclo" = data de fim do ciclo pago; no Grátis, a palavra 'gratis'.
  with base as (
    select p.id as user_id,
           p.buscas_restantes,
           p.creditos_desbloqueio,
           l.buscas as limite_buscas,
           l.desbloqueios as limite_desbloqueios,
           coalesce(((p.plano_valido_ate at time zone 'America/Sao_Paulo')::date)::text, 'gratis') as ciclo,
           case
             when p.plano <> 'gratis' and p.plano_valido_ate is not null then format(
               'Na renovação, em %s, o saldo volta ao limite do plano. Se precisar antes, dá para comprar um pacote extra em Meu plano.',
               to_char(p.plano_valido_ate at time zone 'America/Sao_Paulo', 'DD/MM'))
             else 'No plano Grátis o saldo não renova. Veja em Meu plano as opções para continuar.'
           end as dica
      from public.profiles p
      cross join lateral public.limites_do_plano(p.plano) l
  ),
  candidatos as (
    select user_id,
           'saldo-buscas:' || ciclo as chave,
           case buscas_restantes
             when 0 then 'Suas buscas acabaram'
             when 1 then 'Resta só 1 busca'
             else format('Restam só %s buscas', buscas_restantes)
           end as titulo,
           dica as texto
      from base
      where buscas_restantes <= 3 and buscas_restantes < limite_buscas
    union all
    select user_id,
           'saldo-desbloqueios:' || ciclo,
           case creditos_desbloqueio
             when 0 then 'Seus desbloqueios acabaram'
             when 1 then 'Resta só 1 desbloqueio'
             else format('Restam só %s desbloqueios', creditos_desbloqueio)
           end,
           dica
      from base
      where creditos_desbloqueio <= 5 and creditos_desbloqueio < limite_desbloqueios
  ),
  registradas as (
    insert into public.notificacoes_enviadas (user_id, chave)
    select user_id, chave from candidatos
    on conflict do nothing
    returning user_id, chave
  )
  insert into public.notificacoes (user_id, tipo, titulo, texto, link)
  select c.user_id, 'saldo', c.titulo, c.texto, '/painel/plano'
    from candidatos c
    join registradas r using (user_id, chave);
  get diagnostics v_saldo = row_count;

  -- c) Novidades do site (escritas por você na tabela "novidades") -----------
  with candidatos as (
    select p.id as user_id,
           'novidade:' || n.id as chave,
           n.titulo, n.texto, n.link, n.publicar_em, n.id as novidade_id
      from public.novidades n
      join public.profiles p
        on (p.created_at at time zone 'America/Sao_Paulo')::date <= n.publicar_em
      where n.publicar_em <= v_hoje
        and n.publicar_em >= v_hoje - 30
  ),
  registradas as (
    insert into public.notificacoes_enviadas (user_id, chave)
    select user_id, chave from candidatos
    on conflict do nothing
    returning user_id, chave
  )
  insert into public.notificacoes (user_id, tipo, titulo, texto, link)
  select c.user_id, 'novidade', c.titulo, c.texto, c.link
    from candidatos c
    join registradas r using (user_id, chave)
    order by c.publicar_em, c.novidade_id;
  get diagnostics v_novidade = row_count;

  -- d) Incentivo (no máximo 1 por dia por usuário) ----------------------------
  -- Chave: 'incentivo:<data>:<tipo>'. A data garante o "1 por dia"; o
  -- tipo permite checar "o mesmo tipo não se repete em 7 dias".
  -- O nome da empresa vem do cache do lead (etapa 4), quando existe.
  with vendas_paradas as (
    select distinct on (v.user_id)
           v.user_id,
           count(*) over (partition by v.user_id) as qtd,
           left(to_jsonb(l) -> 'dados' ->> 'nome', 60) as nome,
           v.status,
           extract(day from now() - v.criado_em)::int as dias
      from public.vendas v
      left join public.leads_desbloqueados l
        on l.user_id = v.user_id and l.place_id = v.place_id
      where v.status in ('pendente_verificacao', 'aguardando_google', 'nao_verificada')
        and v.criado_em < now() - interval '7 days'
      order by v.user_id, v.criado_em
  ),
  negociacoes_paradas as (
    select distinct on (l.user_id)
           l.user_id,
           count(*) over (partition by l.user_id) as qtd,
           left(to_jsonb(l) -> 'dados' ->> 'nome', 60) as nome,
           extract(day from now() - coalesce(l.ultimo_contato_em, l.desbloqueado_em))::int as dias
      from public.leads_desbloqueados l
      where l.situacao = 'negociacao'
        and coalesce(l.ultimo_contato_em, l.desbloqueado_em) < now() - interval '7 days'
      order by l.user_id, coalesce(l.ultimo_contato_em, l.desbloqueado_em)
  ),
  sem_contato as (
    select distinct on (l.user_id)
           l.user_id,
           count(*) over (partition by l.user_id) as qtd,
           left(to_jsonb(l) -> 'dados' ->> 'nome', 60) as nome,
           extract(day from now() - l.desbloqueado_em)::int as dias
      from public.leads_desbloqueados l
      where l.situacao = 'desbloqueado'
        and l.desbloqueado_em < now() - interval '3 days'
      order by l.user_id, l.desbloqueado_em desc
  ),
  opcoes as (
    select user_id, 1 as prioridade, 'venda_pendente'::text as tipo,
           case when qtd = 1
             then case when nome is null
                    then 'Uma venda sua ainda não foi confirmada'
                    else format('Sua venda para %s ainda não foi confirmada', nome) end
             else format('%s vendas suas ainda não foram confirmadas', qtd)
           end as titulo,
           (case when qtd = 1
              then format('Você registrou essa venda há %s dias. ', dias)
              else format('A mais antiga%s foi registrada há %s dias. ',
                          coalesce(', de ' || nome || ',', ''), dias)
            end)
           || case status
                when 'aguardando_google' then
                  'O site já está no ar, mas o Google Maps da empresa ainda não mostra esse endereço. Peça ao cliente para colocar o site no perfil do Google: com isso a venda é confirmada e passa a valer 50 pontos.'
                when 'nao_verificada' then
                  'Não conseguimos abrir o site ou ele não está num domínio próprio. Confira o endereço em Score — lá também aparece quando dá para enviar um comprovante.'
                else
                  'Ela ainda espera a verificação semanal. Confira em Score se o endereço do site está certo: confirmada, a venda passa a valer 50 pontos.'
              end as texto,
           '/painel/score'::text as link
      from vendas_paradas
    union all
    select user_id, 2, 'negociacao_parada',
           case when qtd = 1
             then case when nome is null
                    then 'Uma negociação sua está parada'
                    else format('A negociação com %s está parada', nome) end
             else format('%s negociações paradas há mais de 7 dias', qtd)
           end,
           case when qtd = 1
             then format('Faz %s dias sem nenhum movimento. Um retorno rápido, como "conseguiu ver a proposta?", costuma destravar a conversa.', dias)
             else format('A mais antiga%s está sem movimento há %s dias. Um retorno rápido, como "conseguiu ver a proposta?", costuma destravar a conversa.',
                         coalesce(', com ' || nome || ',', ''), dias)
           end,
           '/painel/meus-leads'
      from negociacoes_paradas
    union all
    select user_id, 3, 'sem_contato',
           case when qtd = 1
             then case when nome is null
                    then 'Um lead desbloqueado ainda está sem contato'
                    else format('%s ainda está sem contato', nome) end
             else format('%s leads desbloqueados ainda sem contato', qtd)
           end,
           case when qtd = 1
             then format('Você desbloqueou esse lead há %s dias. Quanto antes o primeiro contato, maior a chance de fechar — dá para chamar no WhatsApp direto de Meus leads.', dias)
             else format('O mais recente%s foi desbloqueado há %s dias. Quanto antes o primeiro contato, maior a chance de fechar — dá para chamar no WhatsApp direto de Meus leads.',
                         coalesce(', ' || nome || ',', ''), dias)
           end,
           '/painel/meus-leads'
      from sem_contato
  ),
  permitidas as (
    select o.*
      from opcoes o
      where not exists (
              -- já recebeu um incentivo hoje
              select 1 from public.notificacoes_enviadas e
               where e.user_id = o.user_id
                 and e.chave like 'incentivo:' || v_hoje::text || ':%'
            )
        and not exists (
              -- já recebeu este mesmo tipo nos últimos 7 dias
              select 1 from public.notificacoes_enviadas e
               where e.user_id = o.user_id
                 and e.chave like 'incentivo:%'
                 and split_part(e.chave, ':', 3) = o.tipo
                 and e.criado_em > now() - interval '7 days'
            )
  ),
  candidatos as (
    select distinct on (user_id)
           user_id,
           'incentivo:' || v_hoje::text || ':' || tipo as chave,
           titulo, texto, link
      from permitidas
      order by user_id, prioridade
  ),
  registradas as (
    insert into public.notificacoes_enviadas (user_id, chave)
    select user_id, chave from candidatos
    on conflict do nothing
    returning user_id, chave
  )
  insert into public.notificacoes (user_id, tipo, titulo, texto, link)
  select c.user_id, 'incentivo', c.titulo, c.texto, c.link
    from candidatos c
    join registradas r using (user_id, chave);
  get diagnostics v_incentivo = row_count;

  -- e) Faxina ----------------------------------------------------------------
  -- Notificações lidas há mais de 90 dias somem sozinhas.
  delete from public.notificacoes
    where lida_em is not null and lida_em < now() - interval '90 days';
  -- Chaves velhas que já não podem se repetir. As do plano Grátis ficam
  -- para sempre, porque o Grátis não tem "próximo ciclo".
  delete from public.notificacoes_enviadas
    where criado_em < now() - interval '60 days'
      and chave not like '%:gratis';

  return jsonb_build_object(
    'renovacao', v_renovacao,
    'saldo', v_saldo,
    'novidade', v_novidade,
    'incentivo', v_incentivo
  );
end;
$$;

revoke all on function public.gerar_notificacoes() from public, anon, authenticated;
grant execute on function public.gerar_notificacoes() to service_role;
