-- Caça-leads — Etapa 11, parte 3 de 3: avisos do sino escritos pelo
-- administrador
-- Rode DEPOIS da parte 2 (etapa11-2-admin-paineis.sql), inteiro, de uma
-- vez: Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Como funciona:
--   * você escreve o aviso na tela Gestão > Avisos (título, texto,
--     link opcional, data de início e de fim, e para quem: todos ou um
--     plano);
--   * se a data de início já chegou, o aviso vai na hora para o sino de
--     quem deve receber; a rotina diária (/api/cron/notificacoes) entrega
--     também para quem se cadastrar ou mudar de plano durante o período;
--   * depois da data de fim, o aviso some do sino sozinho;
--   * apagar o aviso tira ele do sino de todo mundo;
--   * "quantos leram" conta quem abriu o sino com o aviso lá, mesmo que
--     depois tenha apagado a notificação.
-- A tabela "novidades" da etapa 9 continua funcionando como antes.

-- 1. Tabela "avisos" ------------------------------------------------------------
create table if not exists public.avisos (
  id bigint generated always as identity primary key,
  titulo text not null check (char_length(titulo) between 1 and 120),
  texto text not null check (char_length(texto) between 1 and 600),
  -- Só páginas do próprio painel, como nas outras notificações: um aviso
  -- nunca leva para um site de fora.
  link text check (link is null or link ~ '^/painel(/[a-z0-9-]+)*$'),
  inicio_em date not null,
  fim_em date not null,
  plano_alvo text check (plano_alvo is null or plano_alvo in ('gratis', 'solo', 'pro')),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint avisos_periodo_valido check (fim_em >= inicio_em)
);

alter table public.avisos enable row level security;
-- Sem GRANT para o usuário comum: ele recebe o aviso pelo sino. O
-- administrador lê e escreve pelas funções abaixo.
revoke all on public.avisos from anon, authenticated;

-- Quem já recebeu cada aviso (garante que ninguém recebe duas vezes).
create table if not exists public.avisos_entregas (
  aviso_id bigint not null references public.avisos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  entregue_em timestamptz not null default now(),
  primary key (aviso_id, user_id)
);
alter table public.avisos_entregas enable row level security;
revoke all on public.avisos_entregas from anon, authenticated;

-- Quem leu cada aviso (preenchida sozinha pelo gatilho do passo 3).
create table if not exists public.avisos_leituras (
  aviso_id bigint not null references public.avisos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  lida_em timestamptz not null default now(),
  primary key (aviso_id, user_id)
);
alter table public.avisos_leituras enable row level security;
revoke all on public.avisos_leituras from anon, authenticated;

-- 2. Notificações ganham "aviso_id" e "expira_em" -------------------------------
-- aviso_id: de qual aviso veio (apagar o aviso apaga a notificação).
-- expira_em: depois dessa hora a notificação some do sino.
alter table public.notificacoes
  add column if not exists aviso_id bigint references public.avisos (id) on delete cascade,
  add column if not exists expira_em timestamptz;

create index if not exists notificacoes_aviso_idx
  on public.notificacoes (aviso_id) where aviso_id is not null;

-- A regra de leitura passa a esconder as notificações vencidas.
drop policy if exists "Usuários veem as próprias notificações" on public.notificacoes;
create policy "Usuários veem as próprias notificações"
  on public.notificacoes
  for select
  to authenticated
  using (user_id = auth.uid() and (expira_em is null or expira_em > now()));

-- 3. Gatilho: marcar como lida conta como leitura do aviso ----------------------
create or replace function public.registrar_leitura_aviso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.aviso_id is not null and new.lida_em is not null and old.lida_em is null then
    insert into public.avisos_leituras (aviso_id, user_id, lida_em)
    values (new.aviso_id, new.user_id, new.lida_em)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists notificacoes_leitura_aviso on public.notificacoes;
create trigger notificacoes_leitura_aviso
  after update of lida_em on public.notificacoes
  for each row execute function public.registrar_leitura_aviso();

-- 4. Entrega: coloca os avisos em vigor no sino de quem deve receber ------------
-- Chamada na hora em que o aviso é criado e todo dia pela rotina
-- /api/cron/notificacoes (papel service_role). Rodar de novo não duplica.
-- Para testar na mão, no SQL Editor:  select public.entregar_avisos();
create or replace function public.entregar_avisos()
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
    select a.id as aviso_id, p.id as user_id, a.titulo, a.texto, a.link,
           -- Some do sino à meia-noite (Brasília) depois do último dia.
           ((a.fim_em + 1)::timestamp at time zone 'America/Sao_Paulo') as expira_em
      from public.avisos a
      join public.profiles p
        on a.plano_alvo is null or p.plano = a.plano_alvo
      where a.inicio_em <= v_hoje
        and a.fim_em >= v_hoje
  ),
  registradas as (
    insert into public.avisos_entregas (aviso_id, user_id)
    select aviso_id, user_id from candidatos
    on conflict do nothing
    returning aviso_id, user_id
  )
  insert into public.notificacoes (user_id, tipo, titulo, texto, link, aviso_id, expira_em)
  select c.user_id, 'novidade', c.titulo, c.texto, c.link, c.aviso_id, c.expira_em
    from candidatos c
    join registradas r using (aviso_id, user_id);
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke all on function public.entregar_avisos() from public, anon, authenticated;
grant execute on function public.entregar_avisos() to service_role;

-- 5. Funções da tela Gestão > Avisos -------------------------------------
create or replace function public.admin_criar_aviso(
  p_titulo text,
  p_texto text,
  p_link text,
  p_inicio date,
  p_fim date,
  p_plano text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_texto text := btrim(coalesce(p_texto, ''));
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
  v_plano text := nullif(btrim(coalesce(p_plano, '')), '');
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_id bigint;
  v_entregues integer := 0;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  if char_length(v_titulo) not between 1 and 120 then
    raise exception 'O título precisa ter de 1 a 120 caracteres.';
  end if;
  if char_length(v_texto) not between 1 and 600 then
    raise exception 'O texto precisa ter de 1 a 600 caracteres.';
  end if;
  if v_link is not null and v_link !~ '^/painel(/[a-z0-9-]+)*$' then
    raise exception 'O link precisa ser uma página do painel, por exemplo /painel/plano.';
  end if;
  if p_inicio is null or p_fim is null then
    raise exception 'Informe a data de início e a de fim.';
  end if;
  if p_fim < p_inicio then
    raise exception 'A data de fim não pode ser antes da data de início.';
  end if;
  if p_fim < v_hoje then
    raise exception 'A data de fim já passou.';
  end if;
  if v_plano is not null and v_plano not in ('gratis', 'solo', 'pro') then
    raise exception 'Plano inválido.';
  end if;

  insert into public.avisos (titulo, texto, link, inicio_em, fim_em, plano_alvo, criado_por)
  values (v_titulo, v_texto, v_link, p_inicio, p_fim, v_plano, auth.uid())
  returning id into v_id;

  if p_inicio <= v_hoje then
    v_entregues := public.entregar_avisos();
  end if;

  perform public.registrar_auditoria(
    'aviso_criado', null, null,
    jsonb_build_object('aviso_id', v_id, 'titulo', v_titulo, 'inicio_em', p_inicio,
                       'fim_em', p_fim, 'plano_alvo', v_plano),
    null
  );

  return jsonb_build_object('id', v_id, 'entregues', v_entregues);
end;
$$;

revoke all on function public.admin_criar_aviso(text, text, text, date, date, text) from public, anon;
grant execute on function public.admin_criar_aviso(text, text, text, date, date, text) to authenticated;

create or replace function public.admin_listar_avisos()
returns table (
  id bigint,
  titulo text,
  texto text,
  link text,
  inicio_em date,
  fim_em date,
  plano_alvo text,
  criado_em timestamptz,
  entregues bigint,
  lidas bigint
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
    select a.id, a.titulo, a.texto, a.link, a.inicio_em, a.fim_em, a.plano_alvo, a.criado_em,
           (select count(*) from public.avisos_entregas e where e.aviso_id = a.id),
           (select count(*) from public.avisos_leituras l where l.aviso_id = a.id)
      from public.avisos a
      order by a.criado_em desc
      limit 200;
end;
$$;

revoke all on function public.admin_listar_avisos() from public, anon;
grant execute on function public.admin_listar_avisos() to authenticated;

-- Apaga o aviso e tira ele do sino de todo mundo.
create or replace function public.admin_apagar_aviso(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aviso public.avisos%rowtype;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  delete from public.avisos where id = p_id returning * into v_aviso;
  if v_aviso.id is null then
    raise exception 'Aviso não encontrado.';
  end if;

  perform public.registrar_auditoria(
    'aviso_apagado', null,
    jsonb_build_object('aviso_id', v_aviso.id, 'titulo', v_aviso.titulo,
                       'inicio_em', v_aviso.inicio_em, 'fim_em', v_aviso.fim_em,
                       'plano_alvo', v_aviso.plano_alvo),
    null, null
  );
end;
$$;

revoke all on function public.admin_apagar_aviso(bigint) from public, anon;
grant execute on function public.admin_apagar_aviso(bigint) to authenticated;

notify pgrst, 'reload schema';

-- 6. Marque a SUA conta como administradora ------------------------------------
-- Rode separado, trocando o e-mail pelo da sua conta no Caça-leads:
--
--   update public.profiles set is_admin = true where email = 'seu-email@exemplo.com';
--   select id, email, apelido, is_admin from public.profiles where is_admin;
--
-- Para tirar o acesso de alguém: o mesmo update com "is_admin = false".
