-- Ártemis Prospect — Etapa 14, parte 2 de 3: Comunidade (publicar, curtir,
-- comentar, republicar, apagar, denunciar e ler o feed)
-- Rode DEPOIS da parte 1 (etapa14-1), inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Todas as funções usam o usuário logado (auth.uid()): não existe
-- parâmetro de "id do usuário", então ninguém age em nome de outra pessoa.
-- Os erros "de regra" saem com códigos próprios, que o site usa para
-- escolher a mensagem:
--   AP402 = recurso dos planos Solo e Pro (o site mostra o convite para assinar);
--   AP423 = conta suspensa da comunidade;
--   AP428 = falta aceitar as regras da comunidade;
--   AP429 = limite do dia ou intervalo mínimo entre publicações.

-- 1. Conferência comum antes de publicar, comentar ou denunciar ----------------------
-- Trava o perfil (dois envios ao mesmo tempo não furam o limite), confere
-- aceite das regras, suspensão, limite do dia e intervalo mínimo, e já
-- conta o uso. Se a publicação falhar depois, o banco desfaz tudo junto
-- (inclusive a contagem). Uso interno.
create or replace function public.comunidade_registrar_uso(p_tipo text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lim record;
  v_total boolean;
  v_susp timestamptz;
  v_hoje integer;
  v_ultimo timestamptz;
  v_max integer;
  v_intervalo integer;
  v_espera integer;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;

  perform 1 from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'Perfil não encontrado.';
  end if;

  if p_tipo in ('post', 'comentario') and not exists (
    select 1 from public.comunidade_aceites
     where user_id = v_uid and versao = public.comunidade_versao_regras()
  ) then
    raise exception 'Leia e aceite as regras da comunidade antes de publicar.'
      using errcode = 'AP428';
  end if;

  v_susp := public.comunidade_suspenso_ate(v_uid);
  if v_susp is not null then
    if v_susp = 'infinity'::timestamptz then
      raise exception 'Sua conta foi suspensa da comunidade de forma definitiva.'
        using errcode = 'AP423';
    end if;
    raise exception 'Sua conta está suspensa da comunidade até %.',
      to_char(v_susp at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
      using errcode = 'AP423';
  end if;

  select * into v_lim from public.comunidade_limites();
  v_total := public.comunidade_acesso_total(v_uid);

  if p_tipo = 'post' then
    v_max := case when v_total then v_lim.posts_dia else v_lim.posts_dia_gratis end;
    v_intervalo := v_lim.intervalo_post_seg;
  elsif p_tipo = 'comentario' then
    v_max := v_lim.comentarios_dia;
    v_intervalo := v_lim.intervalo_comentario_seg;
  elsif p_tipo = 'denuncia' then
    v_max := v_lim.denuncias_dia;
    v_intervalo := 0;
  else
    raise exception 'Tipo de uso inválido.';
  end if;

  select count(*) filter (where criado_em >= public.comunidade_inicio_do_dia()),
         max(criado_em)
    into v_hoje, v_ultimo
    from public.comunidade_uso
   where user_id = v_uid
     and tipo = p_tipo
     and criado_em > now() - interval '25 hours';

  if v_hoje >= v_max then
    if p_tipo = 'post' and not v_total then
      raise exception 'No plano Grátis dá para publicar 1 post por dia. Volte amanhã ou assine o Solo ou o Pro para publicar mais.'
        using errcode = 'AP402';
    elsif p_tipo = 'post' then
      raise exception 'Você chegou ao limite de % posts por dia. Volte amanhã.', v_max
        using errcode = 'AP429';
    elsif p_tipo = 'comentario' then
      raise exception 'Você chegou ao limite de % comentários por dia. Volte amanhã.', v_max
        using errcode = 'AP429';
    else
      raise exception 'Você chegou ao limite de % denúncias por dia. Volte amanhã.', v_max
        using errcode = 'AP429';
    end if;
  end if;

  if v_intervalo > 0 and v_ultimo is not null
     and v_ultimo > now() - make_interval(secs => v_intervalo) then
    v_espera := ceil(extract(epoch from (v_ultimo + make_interval(secs => v_intervalo) - now())))::int;
    raise exception 'Calma! Espere % segundo(s) para % de novo.',
      greatest(v_espera, 1),
      case when p_tipo = 'post' then 'publicar' else 'comentar' end
      using errcode = 'AP429';
  end if;

  insert into public.comunidade_uso (user_id, tipo) values (v_uid, p_tipo);

  -- Faxina de vez em quando: contagens com mais de 7 dias não servem mais.
  if random() < 0.02 then
    delete from public.comunidade_uso where criado_em < now() - interval '7 days';
  end if;

  return v_total;
end;
$$;

revoke all on function public.comunidade_registrar_uso(text) from public, anon, authenticated;

-- 2. Montagem do post em JSON (uso interno) -------------------------------------------
-- O autor aparece só com apelido e avatar. Nunca e-mail, nome real ou id.
create or replace function public.comunidade_autor_json(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object('apelido', p.apelido, 'foto_path', p.foto_path, 'avatar_pronto', p.avatar_pronto)
       from public.profiles p where p.id = p_user),
    jsonb_build_object('apelido', null, 'foto_path', null, 'avatar_pronto', null)
  );
$$;

revoke all on function public.comunidade_autor_json(uuid) from public, anon, authenticated;

create or replace function public.comunidade_conteudo_json(p public.comunidade_posts)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'autor', public.comunidade_autor_json(p.user_id),
    'texto', p.texto,
    'categoria', p.categoria,
    'imagens', to_jsonb(p.imagens),
    'link_url', p.link_url,
    'link_previa', p.link_previa,
    'criado_em', p.criado_em
  );
$$;

revoke all on function public.comunidade_conteudo_json(public.comunidade_posts) from public, anon, authenticated;

create or replace function public.comunidade_post_json(p public.comunidade_posts, p_viewer uuid, p_admin boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.comunidade_conteudo_json(p) || jsonb_build_object(
    'tipo', p.tipo,
    'curtidas', (select count(*) from public.comunidade_curtidas c where c.post_id = p.id),
    'comentarios', (select count(*) from public.comunidade_comentarios c
                     where c.post_id = p.id and c.removido_em is null),
    'reposts', (select count(*) from public.comunidade_posts r
                 where r.repost_de = p.id and r.removido_em is null),
    'eu_curti', coalesce(p_viewer is not null and exists (
                  select 1 from public.comunidade_curtidas c where c.post_id = p.id and c.user_id = p_viewer), false),
    'eu_repostei', coalesce(p_viewer is not null and exists (
                  select 1 from public.comunidade_posts r
                   where r.repost_de = coalesce(p.repost_de, p.id) and r.user_id = p_viewer and r.tipo = 'repost'), false),
    'sou_autor', coalesce(p.user_id = p_viewer, false),
    'pode_apagar', coalesce(p.user_id = p_viewer or p_admin, false),
    'removido', p.removido_em is not null,
    'original', case when p.tipo = 'repost' then (
                  select public.comunidade_conteudo_json(o) from public.comunidade_posts o
                   where o.id = p.repost_de and o.removido_em is null) end
  );
$$;

revoke all on function public.comunidade_post_json(public.comunidade_posts, uuid, boolean) from public, anon, authenticated;

-- 3. Estado do usuário na comunidade (para a tela) ------------------------------------
create or replace function public.comunidade_meu_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lim record;
  v_total boolean;
  v_susp timestamptz;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;
  select * into v_lim from public.comunidade_limites();
  v_total := public.comunidade_acesso_total(v_uid);
  v_susp := public.comunidade_suspenso_ate(v_uid);

  return jsonb_build_object(
    'acesso_total', v_total,
    'admin', public.eh_admin(),
    'regras_aceitas', exists (
      select 1 from public.comunidade_aceites
       where user_id = v_uid and versao = public.comunidade_versao_regras()),
    'suspenso', v_susp is not null,
    'suspenso_ate', case when v_susp is null or v_susp = 'infinity'::timestamptz then null else v_susp end,
    'posts_hoje', (select count(*) from public.comunidade_uso
                    where user_id = v_uid and tipo = 'post' and criado_em >= public.comunidade_inicio_do_dia()),
    'limite_posts', case when v_total then v_lim.posts_dia else v_lim.posts_dia_gratis end,
    'apelido', (select apelido from public.profiles where id = v_uid)
  );
end;
$$;

revoke all on function public.comunidade_meu_estado() from public, anon;
grant execute on function public.comunidade_meu_estado() to authenticated;

-- 4. Aceitar as regras -------------------------------------------------------------
create or replace function public.comunidade_aceitar_regras()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;
  insert into public.comunidade_aceites (user_id, versao)
  values (auth.uid(), public.comunidade_versao_regras())
  on conflict (user_id, versao) do nothing;
end;
$$;

revoke all on function public.comunidade_aceitar_regras() from public, anon;
grant execute on function public.comunidade_aceitar_regras() to authenticated;

-- 5. Publicar ------------------------------------------------------------------------
-- p_imagens: caminhos já enviados ao bucket "comunidade", na pasta do
-- próprio usuário. Só Solo/Pro (e a regra do bucket já recusa o envio
-- no Grátis). Cada imagem só pode ser usada em um post.
create or replace function public.comunidade_publicar(
  p_texto text,
  p_categoria text,
  p_imagens text[],
  p_link text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_texto text := btrim(coalesce(p_texto, ''));
  v_categoria text := nullif(btrim(coalesce(p_categoria, '')), '');
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
  v_imagens text[];
  v_img text;
  v_total boolean;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;

  -- Tira vazios e repetidos, mantendo a ordem escolhida.
  select coalesce(array_agg(u.i order by u.ordem), '{}') into v_imagens
    from (
      select distinct on (i) i, ordem
        from unnest(coalesce(p_imagens, '{}')) with ordinality as x(i, ordem)
       where nullif(btrim(i), '') is not null
       order by i, ordem
    ) u;

  if char_length(v_texto) > 500 then
    raise exception 'O texto pode ter no máximo 500 caracteres.';
  end if;
  if v_categoria is not null and v_categoria not in ('layout', 'ferramenta', 'duvida', 'conquista') then
    raise exception 'Categoria inválida.';
  end if;
  if v_link is not null and (char_length(v_link) > 500 or v_link !~* '^https?://[^[:space:]]+$') then
    raise exception 'Link inválido. Use um endereço que comece com http:// ou https://.';
  end if;
  if cardinality(v_imagens) > 4 then
    raise exception 'Dá para anexar no máximo 4 imagens.';
  end if;
  if v_texto = '' and cardinality(v_imagens) = 0 then
    raise exception 'Escreva algo ou anexe uma imagem.';
  end if;

  v_total := public.comunidade_registrar_uso('post');

  if cardinality(v_imagens) > 0 then
    if not v_total then
      raise exception 'Imagens nos posts são dos planos Solo e Pro.'
        using errcode = 'AP402';
    end if;
    foreach v_img in array v_imagens loop
      if v_img !~ ('^' || v_uid::text || '/[0-9]{10,16}-[a-z0-9]{4,16}\.(webp|jpg)$') then
        raise exception 'Imagem inválida.';
      end if;
      if not exists (select 1 from storage.objects where bucket_id = 'comunidade' and name = v_img) then
        raise exception 'Uma das imagens não foi encontrada. Envie de novo.';
      end if;
    end loop;
    if exists (select 1 from public.comunidade_posts where imagens && v_imagens) then
      raise exception 'Uma das imagens já foi usada em outro post.';
    end if;
  end if;

  insert into public.comunidade_posts (user_id, tipo, texto, categoria, imagens, link_url)
  values (v_uid, 'post', v_texto, v_categoria, v_imagens, v_link)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.comunidade_publicar(text, text, text[], text) from public, anon;
grant execute on function public.comunidade_publicar(text, text, text[], text) to authenticated;

-- Prévia do link: quem grava é o SERVIDOR (chave service_role), depois de
-- ler o título e a descrição da página. O navegador não consegue gravar
-- uma prévia falsa. Só guarda título, descrição e site, em tamanho curto.
create or replace function public.comunidade_salvar_previa(p_post bigint, p_previa jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.comunidade_posts
     set link_previa = case
       when p_previa is null then null
       else jsonb_strip_nulls(jsonb_build_object(
         'titulo', nullif(left(btrim(p_previa ->> 'titulo'), 200), ''),
         'descricao', nullif(left(btrim(p_previa ->> 'descricao'), 300), ''),
         'site', nullif(left(btrim(p_previa ->> 'site'), 100), '')
       ))
     end
   where id = p_post and link_url is not null;
$$;

revoke all on function public.comunidade_salvar_previa(bigint, jsonb) from public, anon, authenticated;
grant usage on schema public to service_role;
grant execute on function public.comunidade_salvar_previa(bigint, jsonb) to service_role;

-- 6. Republicar ------------------------------------------------------------------------
-- Com ou sem comentário próprio (p_texto). Republicar uma republicação
-- aponta para o post original. Só Solo/Pro.
create or replace function public.comunidade_republicar(p_post bigint, p_texto text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_texto text := btrim(coalesce(p_texto, ''));
  v_alvo public.comunidade_posts%rowtype;
  v_original bigint;
  v_total boolean;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;
  if char_length(v_texto) > 500 then
    raise exception 'O comentário pode ter no máximo 500 caracteres.';
  end if;

  select * into v_alvo from public.comunidade_posts where id = p_post;
  v_original := case when v_alvo.tipo = 'repost' then v_alvo.repost_de else v_alvo.id end;
  select * into v_alvo from public.comunidade_posts where id = v_original;
  if v_alvo.id is null or v_alvo.removido_em is not null then
    raise exception 'Esse post não está mais disponível.';
  end if;
  if v_alvo.user_id = v_uid then
    raise exception 'Você não pode republicar o próprio post.';
  end if;

  v_total := public.comunidade_registrar_uso('post');
  if not v_total then
    raise exception 'Republicar é dos planos Solo e Pro.'
      using errcode = 'AP402';
  end if;

  if exists (
    select 1 from public.comunidade_posts
     where user_id = v_uid and repost_de = v_original and tipo = 'repost'
  ) then
    raise exception 'Você já republicou esse post.';
  end if;

  insert into public.comunidade_posts (user_id, tipo, repost_de, texto)
  values (v_uid, 'repost', v_original, v_texto)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Você já republicou esse post.';
end;
$$;

revoke all on function public.comunidade_republicar(bigint, text) from public, anon;
grant execute on function public.comunidade_republicar(bigint, text) to authenticated;

-- 7. Comentar ------------------------------------------------------------------------
create or replace function public.comunidade_comentar(p_post bigint, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_texto text := btrim(coalesce(p_texto, ''));
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;
  if char_length(v_texto) < 1 then
    raise exception 'Escreva o comentário.';
  end if;
  if char_length(v_texto) > 300 then
    raise exception 'O comentário pode ter no máximo 300 caracteres.';
  end if;
  if not exists (select 1 from public.comunidade_posts where id = p_post and removido_em is null) then
    raise exception 'Esse post não está mais disponível.';
  end if;

  perform public.comunidade_registrar_uso('comentario');

  insert into public.comunidade_comentarios (post_id, user_id, texto)
  values (p_post, v_uid, v_texto)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'autor', public.comunidade_autor_json(v_uid),
    'texto', v_texto,
    'criado_em', now(),
    'sou_autor', true,
    'pode_apagar', true
  );
end;
$$;

revoke all on function public.comunidade_comentar(bigint, text) from public, anon;
grant execute on function public.comunidade_comentar(bigint, text) to authenticated;

-- 8. Curtir / descurtir ------------------------------------------------------------------
-- Devolve o total atualizado. Qualquer plano. Suspenso não curte.
create or replace function public.comunidade_curtir(p_post bigint, p_curtir boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;
  if public.comunidade_suspenso_ate(v_uid) is not null then
    raise exception 'Sua conta está suspensa da comunidade.'
      using errcode = 'AP423';
  end if;

  if p_curtir then
    if not exists (select 1 from public.comunidade_posts where id = p_post and removido_em is null) then
      raise exception 'Esse post não está mais disponível.';
    end if;
    insert into public.comunidade_curtidas (post_id, user_id)
    values (p_post, v_uid)
    on conflict (post_id, user_id) do nothing;
  else
    delete from public.comunidade_curtidas where post_id = p_post and user_id = v_uid;
  end if;

  return jsonb_build_object(
    'curtidas', (select count(*) from public.comunidade_curtidas where post_id = p_post),
    'eu_curti', coalesce(p_curtir, false)
  );
end;
$$;

revoke all on function public.comunidade_curtir(bigint, boolean) from public, anon;
grant execute on function public.comunidade_curtir(bigint, boolean) to authenticated;

-- 9. Apagar post / comentário --------------------------------------------------------------
-- Cada um apaga só o próprio conteúdo; o administrador apaga qualquer um
-- (e fica registrado na auditoria quem apagou e quando). Devolve os
-- caminhos das imagens, para o servidor apagar os arquivos do Storage.
create or replace function public.comunidade_apagar_post(p_id bigint)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_post public.comunidade_posts%rowtype;
  v_admin boolean := public.eh_admin();
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;

  select * into v_post from public.comunidade_posts where id = p_id for update;
  if v_post.id is null then
    raise exception 'Post não encontrado.';
  end if;
  if v_post.user_id <> v_uid and not v_admin then
    raise exception 'Você só pode apagar o seu próprio conteúdo.';
  end if;

  -- Denúncias abertas sobre o post (e os comentários dele) se encerram.
  update public.comunidade_denuncias
     set situacao = 'resolvida',
         decisao = case when v_post.user_id = v_uid then 'apagado_pelo_autor' else 'apagado' end,
         decidida_por = v_uid,
         decidida_em = now()
   where situacao = 'pendente'
     and ((alvo_tipo = 'post' and alvo_id = p_id) or (alvo_tipo = 'comentario' and post_id = p_id));

  if v_post.user_id <> v_uid then
    perform public.registrar_auditoria(
      'comunidade_post_apagado',
      v_post.user_id,
      jsonb_build_object('post_id', v_post.id, 'texto', left(v_post.texto, 500),
                         'imagens', to_jsonb(v_post.imagens), 'link', v_post.link_url),
      null,
      null
    );
  end if;

  delete from public.comunidade_posts where id = p_id;
  return v_post.imagens;
end;
$$;

revoke all on function public.comunidade_apagar_post(bigint) from public, anon;
grant execute on function public.comunidade_apagar_post(bigint) to authenticated;

create or replace function public.comunidade_apagar_comentario(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_com public.comunidade_comentarios%rowtype;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;

  select * into v_com from public.comunidade_comentarios where id = p_id for update;
  if v_com.id is null then
    raise exception 'Comentário não encontrado.';
  end if;
  if v_com.user_id <> v_uid and not public.eh_admin() then
    raise exception 'Você só pode apagar o seu próprio conteúdo.';
  end if;

  update public.comunidade_denuncias
     set situacao = 'resolvida',
         decisao = case when v_com.user_id = v_uid then 'apagado_pelo_autor' else 'apagado' end,
         decidida_por = v_uid,
         decidida_em = now()
   where situacao = 'pendente' and alvo_tipo = 'comentario' and alvo_id = p_id;

  if v_com.user_id <> v_uid then
    perform public.registrar_auditoria(
      'comunidade_comentario_apagado',
      v_com.user_id,
      jsonb_build_object('comentario_id', v_com.id, 'post_id', v_com.post_id, 'texto', v_com.texto),
      null,
      null
    );
  end if;

  delete from public.comunidade_comentarios where id = p_id;
end;
$$;

revoke all on function public.comunidade_apagar_comentario(bigint) from public, anon;
grant execute on function public.comunidade_apagar_comentario(bigint) to authenticated;

-- 10. Denunciar ---------------------------------------------------------------------------
-- p_tipo: post | comentario. Motivo: spam | ofensivo | golpe | improprio | outro.
-- Uma denúncia por pessoa por conteúdo; não dá para denunciar o próprio.
create or replace function public.comunidade_denunciar(
  p_tipo text,
  p_id bigint,
  p_motivo text,
  p_detalhe text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_detalhe text := nullif(btrim(coalesce(p_detalhe, '')), '');
  v_autor uuid;
  v_trecho text;
  v_post bigint;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;
  if p_motivo is null or p_motivo not in ('spam', 'ofensivo', 'golpe', 'improprio', 'outro') then
    raise exception 'Escolha o motivo da denúncia.';
  end if;
  if char_length(v_detalhe) > 500 then
    raise exception 'O detalhe pode ter no máximo 500 caracteres.';
  end if;

  if p_tipo = 'post' then
    select user_id, left(texto, 500), id into v_autor, v_trecho, v_post
      from public.comunidade_posts where id = p_id and removido_em is null;
  elsif p_tipo = 'comentario' then
    select user_id, texto, post_id into v_autor, v_trecho, v_post
      from public.comunidade_comentarios where id = p_id and removido_em is null;
  else
    raise exception 'Tipo inválido.';
  end if;

  if v_autor is null then
    raise exception 'Esse conteúdo não está mais disponível.';
  end if;
  if v_autor = v_uid then
    raise exception 'Você não pode denunciar o seu próprio conteúdo.';
  end if;
  if exists (
    select 1 from public.comunidade_denuncias
     where denunciante_id = v_uid and alvo_tipo = p_tipo and alvo_id = p_id
  ) then
    raise exception 'Você já denunciou esse conteúdo. A moderação vai analisar.';
  end if;

  perform public.comunidade_registrar_uso('denuncia');

  insert into public.comunidade_denuncias
    (alvo_tipo, alvo_id, post_id, autor_id, trecho, denunciante_id, motivo, detalhe)
  values (p_tipo, p_id, v_post, v_autor, v_trecho, v_uid, p_motivo, v_detalhe);
exception
  when unique_violation then
    raise exception 'Você já denunciou esse conteúdo. A moderação vai analisar.';
end;
$$;

revoke all on function public.comunidade_denunciar(text, bigint, text, text) from public, anon;
grant execute on function public.comunidade_denunciar(text, bigint, text, text) to authenticated;

-- 11. Ler o feed ---------------------------------------------------------------------------
-- p_aba: recentes (mais novos primeiro, "carregar mais" pelo p_cursor =
--   id do último post já mostrado) | alta (pontos das últimas 48h:
--   cada curtida vale 1 e cada comentário vale 2; "carregar mais" pelo
--   p_offset).
-- p_apelido: só os posts dessa pessoa (perfil público), mais novos primeiro.
create or replace function public.comunidade_feed(
  p_aba text default 'recentes',
  p_cursor bigint default null,
  p_offset integer default 0,
  p_apelido text default null,
  p_limite integer default 15
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_lim integer := least(greatest(coalesce(p_limite, 15), 1), 30);
  v_autor uuid;
  v_res jsonb;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;
  v_admin := public.eh_admin();

  if p_apelido is not null then
    select id into v_autor from public.profiles where lower(apelido) = lower(btrim(p_apelido));
    if v_autor is null then
      return '[]'::jsonb;
    end if;
    select coalesce(jsonb_agg(s.j order by s.id desc), '[]'::jsonb) into v_res
      from (
        select p.id, public.comunidade_post_json(p, v_uid, v_admin) as j
          from public.comunidade_posts p
         where p.user_id = v_autor
           and p.removido_em is null
           and (p_cursor is null or p.id < p_cursor)
         order by p.id desc
         limit v_lim
      ) s;
    return v_res;
  end if;

  if p_aba = 'alta' then
    select coalesce(jsonb_agg(public.comunidade_post_json(p, v_uid, v_admin)
                              order by t.pontos desc, t.post_id desc), '[]'::jsonb)
      into v_res
      from (
        select x.post_id, sum(x.peso) as pontos
          from (
            select c.post_id, 1 as peso
              from public.comunidade_curtidas c
             where c.criado_em > now() - interval '48 hours'
            union all
            select c.post_id, 2
              from public.comunidade_comentarios c
             where c.criado_em > now() - interval '48 hours' and c.removido_em is null
          ) x
          join public.comunidade_posts pp on pp.id = x.post_id and pp.removido_em is null
         group by x.post_id
         order by sum(x.peso) desc, x.post_id desc
         offset greatest(coalesce(p_offset, 0), 0)
         limit v_lim
      ) t
      join public.comunidade_posts p on p.id = t.post_id;
    return v_res;
  end if;

  select coalesce(jsonb_agg(s.j order by s.id desc), '[]'::jsonb) into v_res
    from (
      select p.id, public.comunidade_post_json(p, v_uid, v_admin) as j
        from public.comunidade_posts p
       where p.removido_em is null
         and (p_cursor is null or p.id < p_cursor)
       order by p.id desc
       limit v_lim
    ) s;
  return v_res;
end;
$$;

revoke all on function public.comunidade_feed(text, bigint, integer, text, integer) from public, anon;
grant execute on function public.comunidade_feed(text, bigint, integer, text, integer) to authenticated;

-- Um post só (página do post, dentro do painel).
create or replace function public.comunidade_post(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_res jsonb;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;
  v_admin := public.eh_admin();
  select public.comunidade_post_json(p, v_uid, v_admin) into v_res
    from public.comunidade_posts p
   where p.id = p_id and (p.removido_em is null or p.user_id = v_uid or v_admin);
  return v_res;
end;
$$;

revoke all on function public.comunidade_post(bigint) from public, anon;
grant execute on function public.comunidade_post(bigint) to authenticated;

-- Link público do post (compartilhar). Quem chama é o SERVIDOR, com a
-- chave service_role: visitantes sem login nunca falam direto com o banco.
-- Devolve só o que já é público no feed; conteúdo removido não aparece.
create or replace function public.comunidade_post_publico(p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.comunidade_post_json(p, null, false)
         - 'eu_curti' - 'eu_repostei' - 'sou_autor' - 'pode_apagar' - 'removido'
    from public.comunidade_posts p
   where p.id = p_id and p.removido_em is null;
$$;

revoke all on function public.comunidade_post_publico(bigint) from public, anon;
grant execute on function public.comunidade_post_publico(bigint) to authenticated, service_role;

-- Comentários de um post, do mais antigo para o mais novo. "Carregar
-- mais" pelo p_cursor (id do último comentário já mostrado).
create or replace function public.comunidade_comentarios_do_post(
  p_post bigint,
  p_cursor bigint default null,
  p_limite integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_lim integer := least(greatest(coalesce(p_limite, 30), 1), 50);
  v_res jsonb;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;
  v_admin := public.eh_admin();

  if not exists (
    select 1 from public.comunidade_posts
     where id = p_post and (removido_em is null or user_id = v_uid or v_admin)
  ) then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(s.j order by s.id), '[]'::jsonb) into v_res
    from (
      select c.id,
             jsonb_build_object(
               'id', c.id,
               'autor', public.comunidade_autor_json(c.user_id),
               'texto', c.texto,
               'criado_em', c.criado_em,
               'sou_autor', c.user_id = v_uid,
               'pode_apagar', c.user_id = v_uid or v_admin
             ) as j
        from public.comunidade_comentarios c
       where c.post_id = p_post
         and c.removido_em is null
         and (p_cursor is null or c.id > p_cursor)
       order by c.id
       limit v_lim
    ) s;
  return v_res;
end;
$$;

revoke all on function public.comunidade_comentarios_do_post(bigint, bigint, integer) from public, anon;
grant execute on function public.comunidade_comentarios_do_post(bigint, bigint, integer) to authenticated;

-- 12. Perfil público na comunidade ------------------------------------------------------------
-- Apelido, avatar, desde quando está no Ártemis, número de posts e — só
-- se a pessoa ligou isso no Perfil — o número de vendas verificadas.
create or replace function public.comunidade_perfil(p_apelido text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles%rowtype;
  v_admin boolean;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;
  v_admin := public.eh_admin();

  select * into v_p from public.profiles where lower(apelido) = lower(btrim(coalesce(p_apelido, '')));
  if v_p.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'apelido', v_p.apelido,
    'foto_path', v_p.foto_path,
    'avatar_pronto', v_p.avatar_pronto,
    'membro_desde', v_p.created_at,
    'posts', (select count(*) from public.comunidade_posts
               where user_id = v_p.id and removido_em is null),
    'sou_eu', v_p.id = v_uid,
    'mostra_vendas', v_p.mostrar_vendas_comunidade,
    'vendas_verificadas', case when v_p.mostrar_vendas_comunidade then (
        select count(*) from public.vendas where user_id = v_p.id and status = 'verificada') end,
    -- Só o administrador vê se a conta está suspensa.
    'suspenso', case when v_admin then public.comunidade_suspenso_ate(v_p.id) is not null end
  );
end;
$$;

revoke all on function public.comunidade_perfil(text) from public, anon;
grant execute on function public.comunidade_perfil(text) to authenticated;

-- Liga/desliga o número de vendas verificadas no perfil público.
create or replace function public.definir_mostrar_vendas_comunidade(p_mostrar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;
  update public.profiles
     set mostrar_vendas_comunidade = coalesce(p_mostrar, false)
   where id = auth.uid();
end;
$$;

revoke all on function public.definir_mostrar_vendas_comunidade(boolean) from public, anon;
grant execute on function public.definir_mostrar_vendas_comunidade(boolean) to authenticated;

notify pgrst, 'reload schema';
