-- Caça-leads — Etapa 5: perfil do usuário (apelido, foto, telefone)
-- Rode isto DEPOIS da etapa 4, inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Nada aqui mexe em planos, créditos, buscas ou cobrança. O usuário
-- continua SEM permissão de escrever direto em "profiles": as únicas
-- portas de escrita desta etapa são as funções "atualizar_perfil" e
-- "definir_foto_perfil", que só tocam em apelido, telefone e foto.

-- 1. Novas colunas em "profiles" ------------------------------------------
-- apelido: nome público (será usado no rank). 3 a 20 caracteres, sem
--   espaço no começo/fim, único sem diferenciar maiúsculas ("Ana" e
--   "ana" contam como o mesmo apelido).
-- foto_path: caminho do arquivo no bucket "avatares" (ex.: "<id>/123.webp").
--   Nulo = sem foto.
-- telefone: só os dígitos, com DDD (10 ou 11 dígitos). Nulo = não informado.
-- telefone_verificado_em: preparado para a verificação por SMS no futuro.
--   Por enquanto fica sempre nulo (nada preenche esta coluna ainda).
alter table public.profiles
  add column if not exists apelido text,
  add column if not exists foto_path text,
  add column if not exists telefone text,
  add column if not exists telefone_verificado_em timestamptz;

alter table public.profiles drop constraint if exists profiles_apelido_formato;
alter table public.profiles add constraint profiles_apelido_formato check (
  apelido is null or (
    char_length(apelido) between 3 and 20
    and apelido = btrim(apelido)
    and apelido !~ '[[:cntrl:]]'
  )
);

alter table public.profiles drop constraint if exists profiles_telefone_formato;
alter table public.profiles add constraint profiles_telefone_formato check (
  telefone is null or telefone ~ '^[1-9][0-9][0-9]{8,9}$'
);

create unique index if not exists profiles_apelido_unico
  on public.profiles (lower(apelido));

-- 2. Apelido padrão -----------------------------------------------------------
-- Quem não escolheu recebe "cacador" + 6 números (ex.: cacador482913).
-- Tenta de novo até achar um que ninguém usa.
create or replace function public.gerar_apelido_padrao()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_apelido text;
begin
  loop
    v_apelido := 'cacador' || lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (
      select 1 from public.profiles where lower(apelido) = lower(v_apelido)
    );
  end loop;
  return v_apelido;
end;
$$;

revoke all on function public.gerar_apelido_padrao() from public, anon, authenticated;

-- Dá um apelido padrão a quem já tinha conta antes desta etapa.
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.profiles where apelido is null loop
    update public.profiles
      set apelido = public.gerar_apelido_padrao()
      where id = v_id;
  end loop;
end;
$$;

alter table public.profiles alter column apelido set not null;

-- 3. Cadastro novo já nasce com apelido padrão -------------------------------
-- Mesma função da etapa 1 (profiles.sql), agora preenchendo o apelido.
-- O gatilho "on_auth_user_created" continua o mesmo e passa a usar esta
-- versão automaticamente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, apelido)
  values (new.id, new.email, public.gerar_apelido_padrao());
  return new;
end;
$$;

-- 4. E-mail do perfil acompanha a troca de e-mail ----------------------------
-- O Supabase Auth só troca auth.users.email DEPOIS que o novo endereço é
-- confirmado. Este gatilho copia o e-mail novo para profiles.email nesse
-- momento, para as duas colunas não ficarem diferentes.
create or replace function public.sincronizar_email_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

revoke all on function public.sincronizar_email_perfil() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sincronizar_email_perfil();

-- 5. Função "atualizar_perfil" ------------------------------------------------
-- Única forma de o usuário mudar apelido e telefone. Sempre usa o usuário
-- logado (auth.uid()): não existe parâmetro de "id", então ninguém altera
-- o perfil de outra pessoa. E o UPDATE só lista apelido/telefone: plano,
-- créditos, buscas e assinatura ficam de fora por construção.
create or replace function public.atualizar_perfil(p_apelido text, p_telefone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_apelido text := btrim(p_apelido);
  v_telefone text := nullif(regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g'), '');
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

  update public.profiles
    set apelido = v_apelido,
        -- Telefone mudou: a verificação (futura) deixa de valer.
        telefone_verificado_em = case
          when telefone is distinct from v_telefone then null
          else telefone_verificado_em
        end,
        telefone = v_telefone
    where id = auth.uid();
exception
  -- Dois usuários pegando o mesmo apelido ao mesmo tempo: o índice único
  -- barra o segundo.
  when unique_violation then
    raise exception 'Esse apelido já está em uso. Escolha outro.'
      using errcode = '23505';
  when check_violation then
    raise exception 'Apelido ou telefone em formato inválido.'
      using errcode = '23514';
end;
$$;

revoke all on function public.atualizar_perfil(text, text) from public, anon;
grant execute on function public.atualizar_perfil(text, text) to authenticated;

-- 6. Função "definir_foto_perfil" ---------------------------------------------
-- Grava (ou apaga, com nulo) o caminho da foto. Só aceita arquivos dentro
-- da pasta do próprio usuário no bucket. Devolve o caminho da foto
-- anterior, para o servidor apagar o arquivo antigo do Storage.
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

  update public.profiles set foto_path = p_path where id = auth.uid();

  return v_antiga;
end;
$$;

revoke all on function public.definir_foto_perfil(text) from public, anon;
grant execute on function public.definir_foto_perfil(text) to authenticated;

-- 7. Reforço de segurança em "profiles" ---------------------------------------
-- Revisão do RLS desta etapa:
--   * SELECT: continua só a política "Usuários veem o próprio perfil"
--     (etapa 1) — cada um lê só a própria linha.
--   * INSERT/UPDATE/DELETE: nenhum GRANT para o navegador, nem de coluna.
--     Mesmo que alguém tente "update profiles set plano = 'pro'" pelo
--     navegador, o Postgres recusa antes de olhar o RLS.
-- O REVOKE abaixo é o mesmo cinto de segurança das etapas 2 e 3, repetido
-- aqui porque esta etapa adicionou colunas.
revoke insert, update, delete on public.profiles from authenticated, anon;

-- 8. Bucket "avatares" no Storage ---------------------------------------------
-- Cria o bucket pelo próprio SQL (não precisa criar pelo painel).
--   * public = true: a foto é lida por um link público (vai aparecer no
--     rank público). Ler é público; ESCREVER continua protegido abaixo.
--   * Limite de 2 MB por arquivo e só JPG, PNG e WEBP — o Supabase recusa
--     qualquer outra coisa, mesmo que alguém pule a tela do site.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatares',
  'avatares',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 9. Regras de acesso (RLS) dos arquivos do bucket ----------------------------
-- Cada usuário só mexe na própria pasta: "<id do usuário>/arquivo".
-- (storage.foldername(name))[1] é o nome da primeira pasta do caminho.
drop policy if exists "Avatares: dono vê os próprios arquivos" on storage.objects;
create policy "Avatares: dono vê os próprios arquivos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Avatares: dono envia na própria pasta" on storage.objects;
create policy "Avatares: dono envia na própria pasta"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Avatares: dono atualiza os próprios arquivos" on storage.objects;
create policy "Avatares: dono atualiza os próprios arquivos"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Avatares: dono apaga os próprios arquivos" on storage.objects;
create policy "Avatares: dono apaga os próprios arquivos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
