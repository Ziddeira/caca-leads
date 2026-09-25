-- Ártemis Prospect — Etapa 14, parte 1 de 3: Comunidade (tabelas, regras
-- de acesso e bucket das imagens)
-- Rode DEPOIS de todos os scripts anteriores (até a etapa 13), inteiro,
-- de uma vez: Supabase > SQL Editor > New query > cole tudo > Run.
-- Depois rode a parte 2 (etapa14-2) e a parte 3 (etapa14-3), nessa ordem.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Como a segurança funciona na Comunidade:
--   * o navegador NÃO escreve direto em nenhuma tabela desta etapa
--     (nenhum GRANT de insert/update/delete). Publicar, comentar, curtir,
--     republicar, apagar e denunciar passam por funções do banco
--     (parte 2), que conferem tudo com o usuário logado (auth.uid());
--   * o RLS (Row Level Security) está ligado em todas as tabelas: cada
--     um lê só o que pode ler (conteúdo removido pela moderação some
--     para todo mundo, menos para o autor e o administrador);
--   * o plano é conferido PELO BANCO: Grátis não envia imagem (a regra
--     do bucket recusa o arquivo) nem republica, e publica 1 post por dia;
--   * nada aqui mexe em planos, créditos, buscas ou cobrança.

-- 1. Novas colunas em "profiles" ----------------------------------------------
-- mostrar_vendas_comunidade: o usuário escolhe no Perfil se o número de
--   vendas verificadas aparece no perfil público da Comunidade.
--   Começa desligado (ninguém é exposto sem pedir).
alter table public.profiles
  add column if not exists mostrar_vendas_comunidade boolean not null default false;

revoke insert, update, delete on public.profiles from authenticated, anon;

-- 2. Regras numéricas (um lugar só para mudar) ---------------------------------
-- Mantenha iguais às de lib/comunidade/regras.ts (que só serve para a tela).
--   posts_dia_gratis: posts por dia no Grátis.
--   posts_dia: posts (inclui republicações) por dia no Solo e no Pro.
--   comentarios_dia: comentários por dia, qualquer plano.
--   intervalo_post_seg: tempo mínimo entre duas publicações.
--   intervalo_comentario_seg: tempo mínimo entre dois comentários.
--   denuncias_dia: denúncias por dia (evita denúncia em massa).
create or replace function public.comunidade_limites()
returns table (
  posts_dia_gratis integer,
  posts_dia integer,
  comentarios_dia integer,
  intervalo_post_seg integer,
  intervalo_comentario_seg integer,
  denuncias_dia integer
)
language sql
immutable
as $$
  select 1, 20, 50, 60, 10, 20;
$$;

-- Versão das regras da comunidade. Se você mudar o texto das regras
-- (lib/comunidade/regras.ts) e quiser que todo mundo aceite de novo,
-- aumente este número lá e aqui.
create or replace function public.comunidade_versao_regras()
returns integer
language sql
immutable
as $$
  select 1;
$$;

-- Meia-noite de hoje, no horário de Brasília (base do "por dia").
create or replace function public.comunidade_inicio_do_dia()
returns timestamptz
language sql
stable
as $$
  select date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
$$;

-- 3. Tabela "comunidade_posts" --------------------------------------------------
-- tipo: post (publicação normal) | repost (republicação de outro post).
-- repost_de: o post original. Se o autor apagar o original, fica nulo e
--   a republicação mostra "post original indisponível".
-- texto: até 500 caracteres (no repost, é o comentário opcional).
-- categoria: layout | ferramenta | duvida | conquista (opcional).
-- imagens: até 4 caminhos no bucket "comunidade" ("<id do usuário>/<arquivo>").
-- link_url / link_previa: link opcional e a prévia simples (título,
--   descrição e site), gravada pelo servidor.
-- removido_*: preenchidos quando a MODERAÇÃO remove o post (quem e quando).
create table if not exists public.comunidade_posts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null default 'post' check (tipo in ('post', 'repost')),
  repost_de bigint references public.comunidade_posts (id) on delete set null,
  texto text not null default '' check (char_length(texto) <= 500),
  categoria text check (categoria is null or categoria in ('layout', 'ferramenta', 'duvida', 'conquista')),
  imagens text[] not null default '{}' check (cardinality(imagens) <= 4),
  link_url text check (
    link_url is null or (char_length(link_url) <= 500 and link_url ~* '^https?://[^[:space:]]+$')
  ),
  link_previa jsonb,
  criado_em timestamptz not null default now(),
  removido_em timestamptz,
  removido_por uuid references auth.users (id) on delete set null,
  removido_motivo text,
  -- Post normal precisa ter texto ou imagem; repost não tem imagem,
  -- link nem categoria próprios.
  constraint comunidade_posts_conteudo check (
    (tipo = 'post' and repost_de is null and (char_length(btrim(texto)) > 0 or cardinality(imagens) > 0))
    or (tipo = 'repost' and cardinality(imagens) = 0 and link_url is null and categoria is null)
  )
);

create index if not exists comunidade_posts_recentes_idx
  on public.comunidade_posts (id desc) where removido_em is null;
create index if not exists comunidade_posts_autor_idx
  on public.comunidade_posts (user_id, id desc);
create index if not exists comunidade_posts_repost_de_idx
  on public.comunidade_posts (repost_de) where repost_de is not null;
create index if not exists comunidade_posts_imagens_idx
  on public.comunidade_posts using gin (imagens);
-- Uma republicação por pessoa por post.
create unique index if not exists comunidade_posts_um_repost
  on public.comunidade_posts (user_id, repost_de) where tipo = 'repost' and repost_de is not null;

-- 4. Tabela "comunidade_curtidas" -----------------------------------------------
create table if not exists public.comunidade_curtidas (
  post_id bigint not null references public.comunidade_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists comunidade_curtidas_recentes_idx
  on public.comunidade_curtidas (criado_em desc, post_id);

-- 5. Tabela "comunidade_comentarios" ----------------------------------------------
-- Um nível só: comentário é sempre de um post (não existe resposta de
-- resposta — não há coluna para isso).
create table if not exists public.comunidade_comentarios (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.comunidade_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 300),
  criado_em timestamptz not null default now(),
  removido_em timestamptz,
  removido_por uuid references auth.users (id) on delete set null,
  removido_motivo text
);

create index if not exists comunidade_comentarios_post_idx
  on public.comunidade_comentarios (post_id, id);
create index if not exists comunidade_comentarios_recentes_idx
  on public.comunidade_comentarios (criado_em desc, post_id);

-- 6. Tabela "comunidade_uso" (contador dos limites diários) ------------------------
-- Uma linha por publicação, comentário ou denúncia. Fica separada dos
-- posts de propósito: apagar um post NÃO devolve a vaga do dia.
-- Linhas com mais de 7 dias são apagadas sozinhas.
create table if not exists public.comunidade_uso (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('post', 'comentario', 'denuncia')),
  criado_em timestamptz not null default now()
);

create index if not exists comunidade_uso_user_idx
  on public.comunidade_uso (user_id, tipo, criado_em desc);

-- 7. Tabela "comunidade_aceites" (regras da comunidade) ------------------------------
-- Quem aceitou qual versão das regras e quando.
create table if not exists public.comunidade_aceites (
  user_id uuid not null references auth.users (id) on delete cascade,
  versao integer not null,
  aceito_em timestamptz not null default now(),
  primary key (user_id, versao)
);

-- 8. Tabela "comunidade_denuncias" -------------------------------------------------
-- alvo_tipo + alvo_id: o post ou o comentário denunciado.
-- autor_id e trecho: guardados na hora da denúncia, para a moderação
--   ainda saber o que era e de quem, mesmo que o autor apague depois.
-- situacao: pendente | resolvida (conteúdo removido ou apagado) |
--   descartada (a moderação achou que não era caso de remover).
create table if not exists public.comunidade_denuncias (
  id bigint generated always as identity primary key,
  alvo_tipo text not null check (alvo_tipo in ('post', 'comentario')),
  alvo_id bigint not null,
  post_id bigint,
  autor_id uuid references auth.users (id) on delete set null,
  trecho text,
  denunciante_id uuid not null references auth.users (id) on delete cascade,
  motivo text not null check (motivo in ('spam', 'ofensivo', 'golpe', 'improprio', 'outro')),
  detalhe text check (detalhe is null or char_length(detalhe) <= 500),
  situacao text not null default 'pendente' check (situacao in ('pendente', 'resolvida', 'descartada')),
  decisao text,
  decidida_por uuid references auth.users (id) on delete set null,
  decidida_em timestamptz,
  criado_em timestamptz not null default now()
);

create unique index if not exists comunidade_denuncias_uma_por_pessoa
  on public.comunidade_denuncias (denunciante_id, alvo_tipo, alvo_id);
create index if not exists comunidade_denuncias_fila_idx
  on public.comunidade_denuncias (situacao, alvo_tipo, alvo_id);

-- 9. Tabela "comunidade_suspensoes" -------------------------------------------------
-- ate: fim da suspensão. Nulo = definitiva.
-- revogada_*: quando você tira a suspensão antes do fim.
-- Suspenso pode ler, mas não publica, comenta, curte, republica nem denuncia.
create table if not exists public.comunidade_suspensoes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ate timestamptz,
  motivo text not null check (char_length(motivo) between 1 and 500),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  revogada_em timestamptz,
  revogada_por uuid references auth.users (id) on delete set null
);

create index if not exists comunidade_suspensoes_user_idx
  on public.comunidade_suspensoes (user_id, criado_em desc);

-- 10. RLS e permissões ------------------------------------------------------------
-- O navegador só LÊ (e só o que as regras abaixo deixam). Nenhuma
-- escrita direta: tudo passa pelas funções da parte 2.
alter table public.comunidade_posts enable row level security;
alter table public.comunidade_curtidas enable row level security;
alter table public.comunidade_comentarios enable row level security;
alter table public.comunidade_uso enable row level security;
alter table public.comunidade_aceites enable row level security;
alter table public.comunidade_denuncias enable row level security;
alter table public.comunidade_suspensoes enable row level security;

grant usage on schema public to authenticated;
grant select on public.comunidade_posts, public.comunidade_curtidas, public.comunidade_comentarios,
  public.comunidade_aceites, public.comunidade_denuncias, public.comunidade_suspensoes
  to authenticated;
revoke insert, update, delete on public.comunidade_posts, public.comunidade_curtidas,
  public.comunidade_comentarios, public.comunidade_uso, public.comunidade_aceites,
  public.comunidade_denuncias, public.comunidade_suspensoes
  from authenticated, anon;
revoke all on public.comunidade_uso from authenticated, anon;
revoke all on public.comunidade_posts, public.comunidade_curtidas, public.comunidade_comentarios,
  public.comunidade_aceites, public.comunidade_denuncias, public.comunidade_suspensoes
  from anon;

drop policy if exists "Comunidade: posts visíveis" on public.comunidade_posts;
create policy "Comunidade: posts visíveis"
  on public.comunidade_posts
  for select
  to authenticated
  using (removido_em is null or user_id = auth.uid() or public.eh_admin());

drop policy if exists "Comunidade: curtidas visíveis" on public.comunidade_curtidas;
create policy "Comunidade: curtidas visíveis"
  on public.comunidade_curtidas
  for select
  to authenticated
  using (true);

drop policy if exists "Comunidade: comentários visíveis" on public.comunidade_comentarios;
create policy "Comunidade: comentários visíveis"
  on public.comunidade_comentarios
  for select
  to authenticated
  using (removido_em is null or user_id = auth.uid() or public.eh_admin());

drop policy if exists "Comunidade: o próprio aceite" on public.comunidade_aceites;
create policy "Comunidade: o próprio aceite"
  on public.comunidade_aceites
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Comunidade: as próprias denúncias; administrador vê todas" on public.comunidade_denuncias;
create policy "Comunidade: as próprias denúncias; administrador vê todas"
  on public.comunidade_denuncias
  for select
  to authenticated
  using (denunciante_id = auth.uid() or public.eh_admin());

drop policy if exists "Comunidade: a própria suspensão; administrador vê todas" on public.comunidade_suspensoes;
create policy "Comunidade: a própria suspensão; administrador vê todas"
  on public.comunidade_suspensoes
  for select
  to authenticated
  using (user_id = auth.uid() or public.eh_admin());

-- 11. Plano e suspensão (conferidos pelo banco) ---------------------------------------
-- Plano que vale AGORA: pago dentro da validade (+ 3 dias de tolerância,
-- a mesma regra da etapa 3) ou Grátis. Administrador tem tudo liberado.
-- Uso interno: o navegador não chama (não dá para espiar o plano dos outros).
create or replace function public.comunidade_acesso_total(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.is_admin
        or (p.plano in ('solo', 'pro')
            and (p.plano_valido_ate is null or p.plano_valido_ate + interval '3 days' >= now()))
      from public.profiles p
     where p.id = p_user
  ), false);
$$;

revoke all on function public.comunidade_acesso_total(uuid) from public, anon, authenticated;

-- Fim da suspensão ativa: nulo = sem suspensão; 'infinity' = definitiva.
create or replace function public.comunidade_suspenso_ate(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(coalesce(s.ate, 'infinity'::timestamptz))
    from public.comunidade_suspensoes s
   where s.user_id = p_user
     and s.revogada_em is null
     and (s.ate is null or s.ate > now());
$$;

revoke all on function public.comunidade_suspenso_ate(uuid) from public, anon, authenticated;

-- Usada pela regra do bucket: o usuário logado pode enviar imagem?
-- (Solo, Pro ou administrador, e sem suspensão.)
create or replace function public.comunidade_posso_enviar_imagem()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and public.comunidade_acesso_total(auth.uid())
     and public.comunidade_suspenso_ate(auth.uid()) is null;
$$;

revoke all on function public.comunidade_posso_enviar_imagem() from public, anon;
grant execute on function public.comunidade_posso_enviar_imagem() to authenticated;

-- 12. Bucket "comunidade" no Storage ------------------------------------------------
-- Criado aqui pelo SQL (não precisa criar pelo painel do Supabase).
--   * public = true: as imagens dos posts são lidas por link público
--     (o link compartilhado de um post mostra as imagens). Ler é público;
--     ENVIAR e APAGAR continuam protegidos abaixo.
--   * até 5 MB por arquivo, só JPG, PNG e WEBP. O site ainda reduz a
--     imagem no navegador antes de enviar (lado maior de 1600 px).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comunidade',
  'comunidade',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Enviar: só na própria pasta ("<id do usuário>/...") e só quem pode
-- enviar imagem (plano Solo/Pro, sem suspensão). Mesmo que alguém do
-- Grátis pule a tela, o Supabase recusa o arquivo.
drop policy if exists "Comunidade: envia imagem na própria pasta" on storage.objects;
create policy "Comunidade: envia imagem na própria pasta"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'comunidade'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.comunidade_posso_enviar_imagem()
  );

drop policy if exists "Comunidade: dono apaga as próprias imagens" on storage.objects;
create policy "Comunidade: dono apaga as próprias imagens"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'comunidade'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Sem política de update: imagem enviada não é trocada, só apagada.
-- O administrador apaga imagens de qualquer um pelo servidor (chave
-- service_role), junto com a remoção do post.

-- 13. Notificação do tipo "comunidade" --------------------------------------------
-- Aviso no sino quando a moderação remove um conteúdo seu ou suspende a
-- sua conta na Comunidade.
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes drop constraint if exists notificacoes_tipo_valido;
alter table public.notificacoes
  add constraint notificacoes_tipo_valido check (
    tipo in ('renovacao', 'saldo', 'novidade', 'incentivo', 'retorno', 'suporte', 'comunidade')
  );

notify pgrst, 'reload schema';
