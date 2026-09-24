-- Caça-leads — Etapa 6: boas-vindas no primeiro acesso e avatares prontos
-- Rode isto DEPOIS da etapa 5, inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Nada aqui mexe em planos, créditos, buscas ou cobrança. Como na etapa
-- 5, o navegador continua sem permissão de escrita direta em "profiles":
-- tudo passa por funções que só tocam em apelido, avatar e foto.

-- 1. Novas colunas em "profiles" ------------------------------------------
-- avatar_pronto: id de um dos avatares desenhados no código (ex.: "mira").
--   Nulo = sem avatar pronto. Foto enviada e avatar pronto não convivem:
--   escolher um apaga o outro.
-- configuracao_inicial_em: quando a pessoa terminou (ou pulou) a tela de
--   boas-vindas. Nulo = ainda não viu a tela.
alter table public.profiles add column if not exists avatar_pronto text;

-- Quem JÁ tinha conta antes desta etapa não vê a tela de boas-vindas.
-- Por isso, só na hora em que a coluna é criada, todas as contas que já
-- existem são marcadas como concluídas. Contas criadas depois nascem com
-- nulo e veem a tela. Rodar o script de novo não marca ninguém.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'configuracao_inicial_em'
  ) then
    alter table public.profiles add column configuracao_inicial_em timestamptz;
    update public.profiles set configuracao_inicial_em = now();
  end if;
end;
$$;

-- Lista dos avatares prontos. Mantenha igual a lib/perfil/avatares.ts.
create or replace function public.avatares_prontos()
returns text[]
language sql
immutable
as $$
  select array[
    'mira', 'lupa', 'bussola', 'foguete', 'raio', 'estrela',
    'coroa', 'trofeu', 'diamante', 'chama', 'pin', 'binoculo'
  ];
$$;

alter table public.profiles drop constraint if exists profiles_avatar_pronto_valido;
alter table public.profiles add constraint profiles_avatar_pronto_valido check (
  avatar_pronto is null or avatar_pronto = any (public.avatares_prontos())
);

-- 2. Função "definir_apelido" ---------------------------------------------
-- Troca SÓ o apelido (a tela de boas-vindas não tem telefone). Mesmas
-- regras de "atualizar_perfil", da etapa 5.
create or replace function public.definir_apelido(p_apelido text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_apelido text := btrim(p_apelido);
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  if v_apelido is null or char_length(v_apelido) < 3 or char_length(v_apelido) > 20 then
    raise exception 'O apelido precisa ter de 3 a 20 caracteres.';
  end if;

  if exists (
    select 1 from public.profiles
    where lower(apelido) = lower(v_apelido) and id <> auth.uid()
  ) then
    raise exception 'Esse apelido já está em uso. Escolha outro.'
      using errcode = '23505';
  end if;

  update public.profiles set apelido = v_apelido where id = auth.uid();
exception
  when unique_violation then
    raise exception 'Esse apelido já está em uso. Escolha outro.'
      using errcode = '23505';
  when check_violation then
    raise exception 'Apelido em formato inválido.'
      using errcode = '23514';
end;
$$;

revoke all on function public.definir_apelido(text) from public, anon;
grant execute on function public.definir_apelido(text) to authenticated;

-- 3. Função "definir_avatar_pronto" ---------------------------------------
-- Escolhe um avatar pronto e tira a foto enviada (se havia). Devolve o
-- caminho da foto antiga, para o servidor apagar o arquivo do Storage.
create or replace function public.definir_avatar_pronto(p_avatar text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antiga text;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  if p_avatar is null or not (p_avatar = any (public.avatares_prontos())) then
    raise exception 'Avatar inválido.';
  end if;

  select foto_path into v_antiga
    from public.profiles
    where id = auth.uid()
    for update;

  update public.profiles
    set avatar_pronto = p_avatar,
        foto_path = null
    where id = auth.uid();

  return v_antiga;
end;
$$;

revoke all on function public.definir_avatar_pronto(text) from public, anon;
grant execute on function public.definir_avatar_pronto(text) to authenticated;

-- 4. "definir_foto_perfil" agora também tira o avatar pronto ---------------
-- Mesma função da etapa 5, com uma linha a mais: enviar uma foto apaga o
-- avatar pronto escolhido antes.
create or replace function public.definir_foto_perfil(p_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antiga text;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  if p_path is not null
     and p_path !~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]{1,64}\.(webp|jpg|png)$') then
    raise exception 'Caminho de foto inválido.';
  end if;

  select foto_path into v_antiga
    from public.profiles
    where id = auth.uid()
    for update;

  update public.profiles
    set foto_path = p_path,
        avatar_pronto = case when p_path is not null then null else avatar_pronto end
    where id = auth.uid();

  return v_antiga;
end;
$$;

revoke all on function public.definir_foto_perfil(text) from public, anon;
grant execute on function public.definir_foto_perfil(text) to authenticated;

-- 5. Função "concluir_configuracao_inicial" --------------------------------
-- Chamada ao terminar OU pular a tela de boas-vindas. Marca como concluída
-- (a tela não aparece mais) e, se a pessoa ficou sem foto e sem avatar,
-- sorteia um dos avatares prontos. O apelido fica como está (o padrão,
-- se ela não trocou).
create or replace function public.concluir_configuracao_inicial()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lista text[] := public.avatares_prontos();
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;

  update public.profiles
    set configuracao_inicial_em = coalesce(configuracao_inicial_em, now()),
        avatar_pronto = case
          when foto_path is null and avatar_pronto is null
            then v_lista[1 + floor(random() * array_length(v_lista, 1))::int]
          else avatar_pronto
        end
    where id = auth.uid();
end;
$$;

revoke all on function public.concluir_configuracao_inicial() from public, anon;
grant execute on function public.concluir_configuracao_inicial() to authenticated;

-- 6. Reforço de segurança em "profiles" ---------------------------------------
-- O mesmo cinto de segurança das etapas anteriores, repetido porque esta
-- etapa adicionou colunas: o navegador só lê a própria linha (política da
-- etapa 1) e não escreve nada direto.
revoke insert, update, delete on public.profiles from authenticated, anon;
