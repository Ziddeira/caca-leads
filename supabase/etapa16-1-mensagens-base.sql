-- Ártemis Prospect — Etapa 16, parte 1 de 3: Mensagens (chat privado):
-- tabelas, regras de acesso (RLS), bucket das imagens e tempo real
-- Rode DEPOIS de todos os scripts anteriores (até a etapa 15), inteiro,
-- de uma vez: Supabase > SQL Editor > New query > cole tudo > Run.
-- Depois rode a parte 2 (etapa16-2) e a parte 3 (etapa16-3), nessa ordem.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Como a segurança do chat funciona:
--   * cada um só LÊ as próprias conversas e mensagens. Isso é garantido
--     pelo RLS (Row Level Security) do banco, não pela tela. As regras
--     de leitura NÃO têm exceção para administrador: nem você lê uma
--     conversa pelo site. A moderação só vê a cópia das últimas
--     mensagens que vai junto com uma DENÚNCIA (tabela chat_denuncias,
--     que o navegador não lê);
--   * o navegador NÃO escreve direto em nenhuma tabela desta etapa.
--     Pedir, aceitar, enviar, bloquear e denunciar passam por funções
--     do banco (parte 2), que conferem tudo com o usuário logado;
--   * as imagens ficam num bucket PRIVADO ("mensagens"): só as duas
--     pessoas da conversa conseguem abrir, por link temporário;
--   * o plano é conferido pelo banco (Grátis responde e mantém até 3
--     conversas ativas; Solo e Pro sem limite);
--   * nada aqui mexe em planos, créditos, buscas ou cobrança.
--
-- Observação honesta: quem é DONO do projeto no Supabase (você, pelo
-- SQL Editor ou pelo Table Editor) sempre consegue ver qualquer tabela —
-- isso é do próprio Supabase e não dá para desligar. As regras acima
-- valem para o site, para o painel de Gestão e para qualquer pessoa
-- usando a chave pública.

-- 1. Regras numéricas (um lugar só para mudar) ---------------------------------
-- Mantenha iguais às de lib/mensagens/regras.ts (que só serve para a tela).
--   pedidos_dia: pedidos de conversa enviados por dia (anti-assédio em massa).
--   pedidos_pendentes: pedidos esperando resposta ao mesmo tempo.
--   mensagens_minuto: mensagens por minuto, somando todas as conversas.
--   conversas_gratis: conversas ativas ao mesmo tempo no plano Grátis.
--   denuncias_dia: denúncias de conversa por dia.
--   dias_novo_pedido: depois de um "recusar" ou "desfazer", quantos dias
--     a outra pessoa espera para poder pedir de novo.
create or replace function public.chat_limites()
returns table (
  pedidos_dia integer,
  pedidos_pendentes integer,
  mensagens_minuto integer,
  conversas_gratis integer,
  denuncias_dia integer,
  dias_novo_pedido integer
)
language sql
immutable
as $$
  select 10, 20, 20, 3, 10, 30;
$$;

-- Versão das regras do chat. Se mudar o texto (lib/mensagens/regras.ts)
-- e quiser que todo mundo aceite de novo, aumente lá e aqui.
create or replace function public.chat_versao_regras()
returns integer
language sql
immutable
as $$
  select 1;
$$;

-- 2. Tabela "chat_conversas" -----------------------------------------------------
-- Uma linha por DUPLA de pessoas (user_a é sempre o menor id, user_b o
-- maior; assim não existem duas conversas entre as mesmas pessoas).
-- situacao:
--   pendente  = pedido enviado, esperando resposta (nada é entregue);
--   aceita    = conversa aberta;
--   recusada  = quem recebeu o pedido recusou;
--   cancelada = quem pediu desistiu antes da resposta;
--   encerrada = alguém desfez a conversa (ou bloqueou a outra pessoa).
-- pedido_por / pedido_em: quem fez o pedido mais recente e quando.
-- encerrada_por / encerrada_em: quem recusou, cancelou ou desfez.
-- Um pedido novo depois de recusado/encerrado reaproveita a mesma linha
-- (o histórico de mensagens continua o mesmo).
create table if not exists public.chat_conversas (
  id bigint generated always as identity primary key,
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  pedido_por uuid not null references auth.users (id) on delete cascade,
  situacao text not null default 'pendente'
    check (situacao in ('pendente', 'aceita', 'recusada', 'cancelada', 'encerrada')),
  criado_em timestamptz not null default now(),
  pedido_em timestamptz not null default now(),
  aceita_em timestamptz,
  encerrada_em timestamptz,
  encerrada_por uuid references auth.users (id) on delete set null,
  ultima_msg_em timestamptz,
  constraint chat_conversas_par check (user_a < user_b),
  constraint chat_conversas_quem_pediu check (pedido_por in (user_a, user_b))
);

create unique index if not exists chat_conversas_par_unico
  on public.chat_conversas (user_a, user_b);
create index if not exists chat_conversas_b_idx
  on public.chat_conversas (user_b);
create index if not exists chat_conversas_pedidos_idx
  on public.chat_conversas (pedido_por, situacao);

-- 3. Tabela "chat_mensagens" -------------------------------------------------------
-- texto: até 1000 caracteres. imagem: caminho no bucket "mensagens"
--   ("<id da conversa>/<id do autor>/<arquivo>"). Precisa de um dos dois.
-- lida_em: quando a outra pessoa leu (nulo = enviada, ainda não lida).
create table if not exists public.chat_mensagens (
  id bigint generated always as identity primary key,
  conversa_id bigint not null references public.chat_conversas (id) on delete cascade,
  autor_id uuid not null references auth.users (id) on delete cascade,
  texto text not null default '' check (char_length(texto) <= 1000),
  imagem text check (imagem is null or char_length(imagem) <= 200),
  criado_em timestamptz not null default now(),
  lida_em timestamptz,
  constraint chat_mensagens_conteudo check (char_length(btrim(texto)) > 0 or imagem is not null)
);

create index if not exists chat_mensagens_conversa_idx
  on public.chat_mensagens (conversa_id, id desc);
create index if not exists chat_mensagens_nao_lidas_idx
  on public.chat_mensagens (conversa_id, autor_id) where lida_em is null;
-- Cada imagem só pode ir em uma mensagem.
create unique index if not exists chat_mensagens_imagem_unica
  on public.chat_mensagens (imagem) where imagem is not null;

-- 4. Tabela "chat_bloqueios" ---------------------------------------------------------
-- user_id bloqueou bloqueado_id. Enquanto existir, nenhum dos dois manda
-- pedido para o outro e a conversa some da lista de quem bloqueou.
create table if not exists public.chat_bloqueios (
  user_id uuid not null references auth.users (id) on delete cascade,
  bloqueado_id uuid not null references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (user_id, bloqueado_id),
  constraint chat_bloqueios_outra_pessoa check (user_id <> bloqueado_id)
);

create index if not exists chat_bloqueios_bloqueado_idx
  on public.chat_bloqueios (bloqueado_id);

-- 5. Tabela "chat_uso" (contador dos limites) ------------------------------------------
-- Uma linha por pedido, mensagem ou denúncia. Apagada sozinha depois de
-- 7 dias. Separada das conversas: desistir de um pedido não devolve a vaga.
create table if not exists public.chat_uso (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('pedido', 'mensagem', 'denuncia')),
  criado_em timestamptz not null default now()
);

create index if not exists chat_uso_user_idx
  on public.chat_uso (user_id, tipo, criado_em desc);

-- 6. Tabela "chat_aceites" (regras do chat) -----------------------------------------------
-- Quem aceitou qual versão das regras e quando. As regras avisam que
-- conversas DENUNCIADAS são lidas pela administração.
create table if not exists public.chat_aceites (
  user_id uuid not null references auth.users (id) on delete cascade,
  versao integer not null,
  aceito_em timestamptz not null default now(),
  primary key (user_id, versao)
);

-- 7. Tabela "chat_denuncias" -----------------------------------------------------------------
-- mensagens: CÓPIA das últimas mensagens da conversa no momento da
--   denúncia (é só isso que a administração enxerga).
-- denunciado_id: a outra pessoa da conversa.
-- situacao: pendente | resolvida (a moderação agiu) | descartada.
create table if not exists public.chat_denuncias (
  id bigint generated always as identity primary key,
  conversa_id bigint references public.chat_conversas (id) on delete set null,
  denunciante_id uuid not null references auth.users (id) on delete cascade,
  denunciado_id uuid references auth.users (id) on delete set null,
  motivo text not null check (motivo in ('assedio', 'spam', 'ofensivo', 'golpe', 'improprio', 'outro')),
  detalhe text check (detalhe is null or char_length(detalhe) <= 500),
  mensagens jsonb not null default '[]'::jsonb,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'resolvida', 'descartada')),
  decisao text,
  decidida_por uuid references auth.users (id) on delete set null,
  decidida_em timestamptz,
  criado_em timestamptz not null default now()
);

-- Uma denúncia pendente por pessoa por conversa.
create unique index if not exists chat_denuncias_uma_pendente
  on public.chat_denuncias (denunciante_id, conversa_id) where situacao = 'pendente';
create index if not exists chat_denuncias_fila_idx
  on public.chat_denuncias (situacao, criado_em desc);
create index if not exists chat_denuncias_denunciado_idx
  on public.chat_denuncias (denunciado_id);

-- 8. Quem participa de uma conversa (usada pelas regras abaixo) --------------------------
create or replace function public.chat_participo(p_conversa bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.chat_conversas c
     where c.id = p_conversa and auth.uid() in (c.user_a, c.user_b)
  );
$$;

revoke all on function public.chat_participo(bigint) from public, anon;
grant execute on function public.chat_participo(bigint) to authenticated;

-- A mesma pergunta a partir do nome da pasta no bucket ("123" → conversa
-- 123). Nome de pasta que não é número responde "não".
create or replace function public.chat_participo_pasta(p_pasta text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_pasta ~ '^[0-9]{1,18}$' then public.chat_participo(p_pasta::bigint)
    else false
  end;
$$;

revoke all on function public.chat_participo_pasta(text) from public, anon;
grant execute on function public.chat_participo_pasta(text) to authenticated;

-- 9. RLS e permissões ------------------------------------------------------------------
-- O navegador só LÊ as conversas e mensagens em que participa (é o que
-- também faz o tempo real funcionar só para as duas pessoas). Bloqueios,
-- contadores, aceites e denúncias: nem leitura direta, só pelas funções.
alter table public.chat_conversas enable row level security;
alter table public.chat_mensagens enable row level security;
alter table public.chat_bloqueios enable row level security;
alter table public.chat_uso enable row level security;
alter table public.chat_aceites enable row level security;
alter table public.chat_denuncias enable row level security;

grant usage on schema public to authenticated;
revoke all on public.chat_conversas, public.chat_mensagens, public.chat_bloqueios,
  public.chat_uso, public.chat_aceites, public.chat_denuncias
  from anon, authenticated;
grant select on public.chat_conversas, public.chat_mensagens to authenticated;

-- Sem "or eh_admin()" de propósito: nem administrador lê conversa.
drop policy if exists "Chat: só as próprias conversas" on public.chat_conversas;
create policy "Chat: só as próprias conversas"
  on public.chat_conversas
  for select
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "Chat: só as mensagens das próprias conversas" on public.chat_mensagens;
create policy "Chat: só as mensagens das próprias conversas"
  on public.chat_mensagens
  for select
  to authenticated
  using (public.chat_participo(conversa_id));

-- 10. Bucket "mensagens" no Storage ----------------------------------------------------
-- Criado aqui pelo SQL (não precisa criar pelo painel do Supabase).
--   * public = false: PRIVADO. A imagem só abre por link temporário, e
--     só as duas pessoas da conversa conseguem gerar esse link;
--   * até 5 MB por arquivo, só JPG, PNG e WEBP (nada de executável,
--     PDF, ZIP etc.). O site ainda reduz e converte a imagem no
--     navegador antes de enviar, e o servidor confere o conteúdo do
--     arquivo (não só o nome) antes de entregar a mensagem.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mensagens',
  'mensagens',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Ver/baixar: só quem participa da conversa (a pasta de cima é o id da
-- conversa). Sem exceção para administrador.
drop policy if exists "Mensagens: participantes veem as imagens" on storage.objects;
create policy "Mensagens: participantes veem as imagens"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'mensagens'
    and public.chat_participo_pasta((storage.foldername(name))[1])
  );

-- A regra de envio usa a função chat_pode_enviar, criada na parte 2.
-- Por isso ela é criada lá.

drop policy if exists "Mensagens: dono apaga as próprias imagens" on storage.objects;
create policy "Mensagens: dono apaga as próprias imagens"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'mensagens'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- 11. Tempo real (Supabase Realtime) ----------------------------------------------------
-- Liga o aviso instantâneo de mudanças nestas duas tabelas. O Realtime
-- respeita o RLS acima: cada pessoa só recebe o que ela pode ler.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_mensagens'
    ) then
      alter publication supabase_realtime add table public.chat_mensagens;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_conversas'
    ) then
      alter publication supabase_realtime add table public.chat_conversas;
    end if;
  else
    raise notice 'Publicação supabase_realtime não encontrada: o chat funciona, mas sem atualização instantânea.';
  end if;
end;
$$;

notify pgrst, 'reload schema';
