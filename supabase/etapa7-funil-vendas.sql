-- Ártemis Prospect — Etapa 7: funil de leads e registro de venda fechada
-- Rode isto DEPOIS da etapa 6, inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Nada aqui mexe em planos, créditos, buscas ou cobrança.
--
-- Como a segurança funciona nesta etapa:
--   * o usuário continua SEM permissão de escrever direto em
--     "leads_desbloqueados" e agora também em "vendas";
--   * as únicas portas de escrita são três funções (security definer):
--     "atualizar_situacao_lead", "salvar_anotacao_lead" e
--     "registrar_venda". Todas usam sempre o usuário logado
--     (auth.uid()) e só mexem nos campos que o usuário pode mexer;
--   * os campos de verificação e de pontos das vendas não podem ser
--     gravados por nenhuma dessas funções — ficam para a próxima etapa,
--     que vai rodar só no servidor.

-- 1. Situação, anotação e último contato em cada lead ----------------------
-- situacao: em que ponto do funil o lead está.
--   desbloqueado → contatado → negociacao → fechado (ou perdido)
-- anotacao: texto livre, até 500 caracteres. Nulo = sem anotação.
-- ultimo_contato_em: atualizada sozinha sempre que a situação muda.
alter table public.leads_desbloqueados
  add column if not exists situacao text not null default 'desbloqueado',
  add column if not exists anotacao text,
  add column if not exists ultimo_contato_em timestamptz;

alter table public.leads_desbloqueados
  drop constraint if exists leads_desbloqueados_situacao_valida;
alter table public.leads_desbloqueados
  add constraint leads_desbloqueados_situacao_valida check (
    situacao in ('desbloqueado', 'contatado', 'negociacao', 'fechado', 'perdido')
  );

alter table public.leads_desbloqueados
  drop constraint if exists leads_desbloqueados_anotacao_tamanho;
alter table public.leads_desbloqueados
  add constraint leads_desbloqueados_anotacao_tamanho check (
    anotacao is null or char_length(anotacao) <= 500
  );

-- Para a contagem e o filtro por situação em "Meus leads".
create index if not exists leads_desbloqueados_user_situacao_idx
  on public.leads_desbloqueados (user_id, situacao);

-- O SELECT dessas colunas já está coberto pelo GRANT e pela política de
-- RLS da etapa 2 (cada usuário vê só as próprias linhas). Cinto de
-- segurança extra, caso algum GRANT amplo seja aplicado por engano:
revoke insert, update, delete on public.leads_desbloqueados from authenticated, anon;

-- 2. Tabela "vendas" ----------------------------------------------------------
-- Uma linha por venda fechada. Regras garantidas pelo próprio banco:
--   * a chave estrangeira (user_id, place_id) → leads_desbloqueados só
--     aceita uma venda de um lead que ESSE usuário desbloqueou;
--   * "unique (user_id, place_id)" impede duas vendas do mesmo lead para
--     o mesmo usuário;
--   * valor é opcional e só o dono da venda consegue ler (RLS abaixo).
--     Nenhuma tela pública pode usar esta tabela diretamente.
--
-- Campos da PRÓXIMA etapa (verificação automática e pontos). Por
-- enquanto ficam sempre nulos / "pendente_verificacao":
--   status, verificado, verificado_em, motivo_verificacao, pontos.
create table if not exists public.vendas (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  place_id text not null,
  site_url text not null,
  fechado_em date not null,
  valor numeric(12, 2),
  status text not null default 'pendente_verificacao',
  verificado boolean,
  verificado_em timestamptz,
  motivo_verificacao text,
  pontos integer,
  criado_em timestamptz not null default now(),
  unique (user_id, place_id),
  foreign key (user_id, place_id)
    references public.leads_desbloqueados (user_id, place_id)
    on delete cascade
);

alter table public.vendas drop constraint if exists vendas_status_valido;
alter table public.vendas add constraint vendas_status_valido check (
  status in ('pendente_verificacao', 'verificada', 'recusada')
);

alter table public.vendas drop constraint if exists vendas_site_formato;
alter table public.vendas add constraint vendas_site_formato check (
  char_length(site_url) <= 500
  and site_url ~* '^https?://[^[:space:]/]+\.[^[:space:]]+$'
);

alter table public.vendas drop constraint if exists vendas_valor_valido;
alter table public.vendas add constraint vendas_valor_valido check (
  valor is null or (valor >= 0 and valor <= 10000000)
);

alter table public.vendas drop constraint if exists vendas_motivo_tamanho;
alter table public.vendas add constraint vendas_motivo_tamanho check (
  motivo_verificacao is null or char_length(motivo_verificacao) <= 500
);

create index if not exists vendas_status_idx on public.vendas (status, criado_em);

alter table public.vendas enable row level security;

-- Leitura: cada usuário vê só as próprias vendas. Nada para "anon".
grant select on public.vendas to authenticated;
revoke insert, update, delete on public.vendas from authenticated, anon;
revoke all on public.vendas from anon;

drop policy if exists "Usuários veem as próprias vendas" on public.vendas;
create policy "Usuários veem as próprias vendas"
  on public.vendas
  for select
  to authenticated
  using (user_id = auth.uid());

-- Sem política de insert/update/delete: mesmo que alguém dê GRANT por
-- engano, o RLS continua barrando qualquer escrita vinda do navegador.

-- 3. Trava dos campos de verificação e pontos --------------------------------
-- Terceira camada: se a escrita vier de um usuário comum (papéis
-- "authenticated" ou "anon" — ou seja, pelo navegador, e não por uma
-- função do banco nem pelo servidor), a venda NÃO pode nascer com
-- verificação/pontos preenchidos, nem ter esses campos alterados.
create or replace function public.proteger_verificacao_venda()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pendente_verificacao'
      or new.verificado is not null
      or new.verificado_em is not null
      or new.motivo_verificacao is not null
      or new.pontos is not null then
      raise exception 'Os campos de verificação e pontos não podem ser preenchidos pelo usuário.';
    end if;
  elsif new.status is distinct from old.status
    or new.verificado is distinct from old.verificado
    or new.verificado_em is distinct from old.verificado_em
    or new.motivo_verificacao is distinct from old.motivo_verificacao
    or new.pontos is distinct from old.pontos then
    raise exception 'Os campos de verificação e pontos não podem ser alterados pelo usuário.';
  end if;

  return new;
end;
$$;

revoke all on function public.proteger_verificacao_venda() from public, anon, authenticated;

drop trigger if exists vendas_proteger_verificacao on public.vendas;
create trigger vendas_proteger_verificacao
  before insert or update on public.vendas
  for each row execute function public.proteger_verificacao_venda();

-- 4. Função "atualizar_situacao_lead" ----------------------------------------
-- Troca a situação de um lead do próprio usuário e marca a data do último
-- contato. "fechado" NÃO passa por aqui: só pelo formulário de venda
-- ("registrar_venda"). Um lead com venda registrada fica travado em
-- "fechado" (a venda não some e não pode ser registrada de novo).
-- Devolve a nova data do último contato.
create or replace function public.atualizar_situacao_lead(p_place_id text, p_situacao text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_atual text;
  v_contato timestamptz;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  if p_situacao = 'fechado' then
    raise exception 'Para marcar como fechado, preencha o formulário da venda.';
  end if;

  if p_situacao is null
    or p_situacao not in ('desbloqueado', 'contatado', 'negociacao', 'perdido') then
    raise exception 'Situação inválida.';
  end if;

  select id, situacao, ultimo_contato_em
    into v_id, v_atual, v_contato
    from public.leads_desbloqueados
    where user_id = auth.uid() and place_id = p_place_id
    for update;

  if v_id is null then
    raise exception 'Esse lead não está entre os seus desbloqueados.';
  end if;

  if exists (
    select 1 from public.vendas
    where user_id = auth.uid() and place_id = p_place_id
  ) then
    raise exception 'Este lead já tem uma venda registrada e fica como fechado.';
  end if;

  if v_atual = p_situacao then
    return v_contato;
  end if;

  update public.leads_desbloqueados
    set situacao = p_situacao,
        ultimo_contato_em = now()
    where id = v_id;

  return now();
end;
$$;

revoke all on function public.atualizar_situacao_lead(text, text) from public, anon;
grant execute on function public.atualizar_situacao_lead(text, text) to authenticated;

-- 5. Função "salvar_anotacao_lead" -------------------------------------------
-- Grava a anotação livre (até 500 caracteres) de um lead do próprio
-- usuário. Texto vazio apaga a anotação. Não mexe na situação.
create or replace function public.salvar_anotacao_lead(p_place_id text, p_anotacao text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_texto text := nullif(btrim(coalesce(p_anotacao, '')), '');
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  if char_length(v_texto) > 500 then
    raise exception 'A anotação pode ter no máximo 500 caracteres.';
  end if;

  update public.leads_desbloqueados
    set anotacao = v_texto
    where user_id = auth.uid() and place_id = p_place_id;

  if not found then
    raise exception 'Esse lead não está entre os seus desbloqueados.';
  end if;
end;
$$;

revoke all on function public.salvar_anotacao_lead(text, text) from public, anon;
grant execute on function public.salvar_anotacao_lead(text, text) to authenticated;

-- 6. Função "registrar_venda" -------------------------------------------------
-- Marca o lead como fechado e cria a venda "pendente_verificacao".
-- Confere, no servidor:
--   * que o lead foi desbloqueado por quem está logado;
--   * que ainda não existe venda desse lead para esse usuário;
--   * endereço do site obrigatório (sem "https://" na frente, completa);
--   * data do fechamento entre o dia do desbloqueio e hoje (horário de
--     Brasília);
--   * valor opcional, de 0 a 10 milhões.
-- Não recebe nem grava nenhum campo de verificação ou de pontos.
-- Devolve o id da venda criada.
create or replace function public.registrar_venda(
  p_place_id text,
  p_site_url text,
  p_fechado_em date,
  p_valor numeric
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id bigint;
  v_desbloqueado_em timestamptz;
  v_site text := btrim(coalesce(p_site_url, ''));
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_venda_id bigint;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  -- Trava o lead até o fim da transação: dois envios ao mesmo tempo
  -- nunca criam duas vendas (e o "unique" da tabela barra de novo).
  select id, desbloqueado_em
    into v_lead_id, v_desbloqueado_em
    from public.leads_desbloqueados
    where user_id = auth.uid() and place_id = p_place_id
    for update;

  if v_lead_id is null then
    raise exception 'Esse lead não está entre os seus desbloqueados.';
  end if;

  if exists (
    select 1 from public.vendas
    where user_id = auth.uid() and place_id = p_place_id
  ) then
    raise exception 'Você já registrou uma venda para este lead.';
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

  if p_fechado_em is null then
    raise exception 'Informe a data do fechamento.';
  end if;

  if p_fechado_em > v_hoje then
    raise exception 'A data do fechamento não pode ser no futuro.';
  end if;

  if p_fechado_em < (v_desbloqueado_em at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data do fechamento não pode ser antes do desbloqueio do lead.';
  end if;

  if p_valor is not null and (p_valor < 0 or p_valor > 10000000) then
    raise exception 'Valor recebido inválido.';
  end if;

  insert into public.vendas (user_id, place_id, site_url, fechado_em, valor)
  values (auth.uid(), p_place_id, v_site, p_fechado_em, round(p_valor, 2))
  returning id into v_venda_id;

  update public.leads_desbloqueados
    set situacao = 'fechado',
        ultimo_contato_em = now()
    where id = v_lead_id;

  return v_venda_id;
end;
$$;

revoke all on function public.registrar_venda(text, text, date, numeric) from public, anon;
grant execute on function public.registrar_venda(text, text, date, numeric) to authenticated;

-- 7. Avisa a API do Supabase (PostgREST) para reler as tabelas e funções.
-- Sem isso, às vezes o site continua sem enxergar as colunas e funções
-- novas por alguns minutos.
notify pgrst, 'reload schema';
