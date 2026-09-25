-- Ártemis Prospect — Etapa 14, parte 3 de 3: Comunidade (moderação no
-- painel de Gestão)
-- Rode DEPOIS da parte 2 (etapa14-2), inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Todas as funções "admin_comunidade_*" começam perguntando
-- public.eh_admin() (etapa 11) e recusam quem não é administrador.
-- Toda decisão fica registrada duas vezes: na própria linha (quem
-- removeu/decidiu e quando) e na auditoria da Gestão (admin_auditoria).

-- 1. Fila de denúncias ------------------------------------------------------------
-- Agrupa as denúncias por conteúdo: um cartão por post/comentário, com
-- quantas denúncias, os motivos, o conteúdo atual e quem é o autor.
--   p_situacao: pendente (padrão) | resolvida | descartada.
create or replace function public.admin_comunidade_fila(p_situacao text default 'pendente')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sit text := coalesce(p_situacao, 'pendente');
  v_res jsonb;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;
  if v_sit not in ('pendente', 'resolvida', 'descartada') then
    raise exception 'Situação inválida.';
  end if;

  with grupos as (
    select d.alvo_tipo,
           d.alvo_id,
           max(d.post_id) as post_id,
           (array_agg(d.autor_id order by d.id))[1] as autor_id,
           (array_agg(d.trecho order by d.id))[1] as trecho,
           count(*) as total,
           min(d.criado_em) as primeira_em,
           max(d.criado_em) as ultima_em,
           max(d.decidida_em) as decidida_em,
           (array_agg(d.decisao order by d.decidida_em desc nulls last))[1] as decisao,
           (array_agg(d.decidida_por order by d.decidida_em desc nulls last))[1] as decidida_por,
           jsonb_agg(
             jsonb_build_object(
               'motivo', d.motivo,
               'detalhe', d.detalhe,
               'denunciante', pd.apelido,
               'criado_em', d.criado_em
             ) order by d.id desc
           ) as denuncias
      from public.comunidade_denuncias d
      left join public.profiles pd on pd.id = d.denunciante_id
     where d.situacao = v_sit
     group by d.alvo_tipo, d.alvo_id
     order by
       case when v_sit = 'pendente' then count(*) end desc nulls last,
       case when v_sit = 'pendente' then min(d.criado_em) end asc,
       max(d.decidida_em) desc nulls last
     limit 100
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'alvo_tipo', g.alvo_tipo,
             'alvo_id', g.alvo_id,
             'post_id', g.post_id,
             'trecho', g.trecho,
             'total', g.total,
             'primeira_em', g.primeira_em,
             'ultima_em', g.ultima_em,
             'decisao', g.decisao,
             'decidida_em', g.decidida_em,
             'decidida_por', (select email from public.profiles where id = g.decidida_por),
             'denuncias', g.denuncias,
             'autor', (
               select jsonb_build_object(
                 'id', pa.id,
                 'apelido', pa.apelido,
                 'email', pa.email,
                 'suspenso_ate', public.comunidade_suspenso_ate(pa.id)
               )
                 from public.profiles pa where pa.id = g.autor_id
             ),
             'conteudo', case
               when g.alvo_tipo = 'post' then (
                 select jsonb_build_object(
                   'tipo', p.tipo,
                   'texto', p.texto,
                   'categoria', p.categoria,
                   'imagens', to_jsonb(p.imagens),
                   'link_url', p.link_url,
                   'criado_em', p.criado_em,
                   'removido_em', p.removido_em,
                   'removido_motivo', p.removido_motivo
                 )
                   from public.comunidade_posts p where p.id = g.alvo_id)
               else (
                 select jsonb_build_object(
                   'texto', c.texto,
                   'criado_em', c.criado_em,
                   'removido_em', c.removido_em,
                   'removido_motivo', c.removido_motivo
                 )
                   from public.comunidade_comentarios c where c.id = g.alvo_id)
             end
           )
         ), '[]'::jsonb)
    into v_res
    from grupos g;

  return v_res;
end;
$$;

revoke all on function public.admin_comunidade_fila(text) from public, anon;
grant execute on function public.admin_comunidade_fila(text) to authenticated;

-- 2. Remover conteúdo ----------------------------------------------------------------
-- O conteúdo some para todo mundo (fica guardado, marcado como removido,
-- com quem removeu, quando e o motivo). As denúncias dele se encerram e
-- o autor recebe um aviso no sino. Devolve as imagens do post, que o
-- servidor apaga do Storage.
create or replace function public.admin_comunidade_remover(p_tipo text, p_id bigint, p_motivo text)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_post public.comunidade_posts%rowtype;
  v_com public.comunidade_comentarios%rowtype;
  v_autor uuid;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;
  if v_motivo is null then
    raise exception 'Escreva o motivo da remoção (o autor vai ver).';
  end if;
  if char_length(v_motivo) > 500 then
    raise exception 'O motivo pode ter no máximo 500 caracteres.';
  end if;

  if p_tipo = 'post' then
    select * into v_post from public.comunidade_posts where id = p_id for update;
    if v_post.id is null then
      raise exception 'Esse post não existe mais (o autor pode ter apagado).';
    end if;
    if v_post.removido_em is not null then
      raise exception 'Esse post já foi removido.';
    end if;
    v_autor := v_post.user_id;

    -- As imagens são apagadas do Storage pelo servidor; a lista antiga
    -- fica guardada na auditoria.
    update public.comunidade_posts
       set removido_em = now(),
           removido_por = auth.uid(),
           removido_motivo = v_motivo,
           imagens = '{}'
     where id = p_id;

    update public.comunidade_denuncias
       set situacao = 'resolvida', decisao = 'removido', decidida_por = auth.uid(), decidida_em = now()
     where situacao = 'pendente'
       and ((alvo_tipo = 'post' and alvo_id = p_id) or (alvo_tipo = 'comentario' and post_id = p_id));

    perform public.registrar_auditoria(
      'comunidade_post_removido',
      v_autor,
      jsonb_build_object('post_id', v_post.id, 'texto', left(v_post.texto, 500),
                         'imagens', to_jsonb(v_post.imagens), 'link', v_post.link_url),
      jsonb_build_object('post_id', v_post.id, 'removido_em', now()),
      v_motivo
    );

    insert into public.notificacoes (user_id, tipo, titulo, texto, link)
    values (
      v_autor,
      'comunidade',
      'Um post seu foi removido da Comunidade',
      left('Motivo: ' || v_motivo || ' Reveja as regras da comunidade antes de publicar de novo.', 600),
      '/painel/comunidade'
    );

    return v_post.imagens;
  elsif p_tipo = 'comentario' then
    select * into v_com from public.comunidade_comentarios where id = p_id for update;
    if v_com.id is null then
      raise exception 'Esse comentário não existe mais (o autor pode ter apagado).';
    end if;
    if v_com.removido_em is not null then
      raise exception 'Esse comentário já foi removido.';
    end if;
    v_autor := v_com.user_id;

    update public.comunidade_comentarios
       set removido_em = now(), removido_por = auth.uid(), removido_motivo = v_motivo
     where id = p_id;

    update public.comunidade_denuncias
       set situacao = 'resolvida', decisao = 'removido', decidida_por = auth.uid(), decidida_em = now()
     where situacao = 'pendente' and alvo_tipo = 'comentario' and alvo_id = p_id;

    perform public.registrar_auditoria(
      'comunidade_comentario_removido',
      v_autor,
      jsonb_build_object('comentario_id', v_com.id, 'post_id', v_com.post_id, 'texto', v_com.texto),
      jsonb_build_object('comentario_id', v_com.id, 'removido_em', now()),
      v_motivo
    );

    insert into public.notificacoes (user_id, tipo, titulo, texto, link)
    values (
      v_autor,
      'comunidade',
      'Um comentário seu foi removido da Comunidade',
      left('Motivo: ' || v_motivo || ' Reveja as regras da comunidade antes de comentar de novo.', 600),
      '/painel/comunidade'
    );

    return '{}'::text[];
  end if;

  raise exception 'Tipo inválido.';
end;
$$;

revoke all on function public.admin_comunidade_remover(text, bigint, text) from public, anon;
grant execute on function public.admin_comunidade_remover(text, bigint, text) to authenticated;

-- 3. Descartar denúncias ---------------------------------------------------------------
-- A moderação olhou e decidiu manter o conteúdo.
create or replace function public.admin_comunidade_descartar(p_tipo text, p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor uuid;
  v_qtd integer;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  with atualizadas as (
    update public.comunidade_denuncias
       set situacao = 'descartada', decisao = 'mantido', decidida_por = auth.uid(), decidida_em = now()
     where situacao = 'pendente' and alvo_tipo = p_tipo and alvo_id = p_id
    returning autor_id
  )
  select count(*), max(autor_id::text)::uuid into v_qtd, v_autor from atualizadas;

  if v_qtd = 0 then
    raise exception 'Não há denúncias pendentes sobre esse conteúdo.';
  end if;

  perform public.registrar_auditoria(
    'comunidade_denuncias_descartadas',
    v_autor,
    jsonb_build_object('alvo_tipo', p_tipo, 'alvo_id', p_id, 'denuncias', v_qtd),
    jsonb_build_object('situacao', 'descartada'),
    null
  );
end;
$$;

revoke all on function public.admin_comunidade_descartar(text, bigint) from public, anon;
grant execute on function public.admin_comunidade_descartar(text, bigint) to authenticated;

-- 4. Suspender e tirar a suspensão ---------------------------------------------------------
-- p_dias: 1 a 365. Nulo = suspensão definitiva. Uma suspensão nova
-- substitui a anterior. Administrador não pode ser suspenso.
create or replace function public.admin_comunidade_suspender(p_user uuid, p_dias integer, p_motivo text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_ate timestamptz;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Usuário não encontrado.';
  end if;
  if p_user = auth.uid() or (select is_admin from public.profiles where id = p_user) then
    raise exception 'Administrador não pode ser suspenso.';
  end if;
  if v_motivo is null then
    raise exception 'Escreva o motivo da suspensão (o usuário vai ver).';
  end if;
  if char_length(v_motivo) > 500 then
    raise exception 'O motivo pode ter no máximo 500 caracteres.';
  end if;
  if p_dias is not null and (p_dias < 1 or p_dias > 365) then
    raise exception 'A suspensão por tempo vai de 1 a 365 dias.';
  end if;

  v_ate := case when p_dias is null then null else now() + make_interval(days => p_dias) end;

  update public.comunidade_suspensoes
     set revogada_em = now(), revogada_por = auth.uid()
   where user_id = p_user and revogada_em is null and (ate is null or ate > now());

  insert into public.comunidade_suspensoes (user_id, ate, motivo, criado_por)
  values (p_user, v_ate, v_motivo, auth.uid());

  perform public.registrar_auditoria(
    'comunidade_suspensao',
    p_user,
    null,
    jsonb_build_object('ate', v_ate, 'definitiva', v_ate is null, 'dias', p_dias),
    v_motivo
  );

  insert into public.notificacoes (user_id, tipo, titulo, texto, link)
  values (
    p_user,
    'comunidade',
    'Sua conta foi suspensa da Comunidade',
    left(
      case
        when v_ate is null then 'A suspensão é definitiva. '
        else 'A suspensão vai até ' || to_char(v_ate at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') || '. '
      end
      || 'Você continua lendo o feed, mas não publica, comenta nem curte. Motivo: ' || v_motivo,
      600
    ),
    '/painel/comunidade'
  );

  return v_ate;
end;
$$;

revoke all on function public.admin_comunidade_suspender(uuid, integer, text) from public, anon;
grant execute on function public.admin_comunidade_suspender(uuid, integer, text) to authenticated;

create or replace function public.admin_comunidade_revogar(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  update public.comunidade_suspensoes
     set revogada_em = now(), revogada_por = auth.uid()
   where user_id = p_user and revogada_em is null and (ate is null or ate > now());
  if not found then
    raise exception 'Esse usuário não está suspenso.';
  end if;

  perform public.registrar_auditoria(
    'comunidade_suspensao_retirada',
    p_user,
    null,
    jsonb_build_object('revogada_em', now()),
    null
  );

  insert into public.notificacoes (user_id, tipo, titulo, texto, link)
  values (
    p_user,
    'comunidade',
    'Sua suspensão na Comunidade acabou',
    'Você já pode publicar, comentar e curtir de novo. Siga as regras da comunidade.',
    '/painel/comunidade'
  );
end;
$$;

revoke all on function public.admin_comunidade_revogar(uuid) from public, anon;
grant execute on function public.admin_comunidade_revogar(uuid) to authenticated;

-- Suspensões ativas agora.
create or replace function public.admin_comunidade_suspensoes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'user_id', s.user_id,
             'apelido', p.apelido,
             'email', p.email,
             'ate', s.ate,
             'motivo', s.motivo,
             'criado_em', s.criado_em,
             'criado_por', (select email from public.profiles where id = s.criado_por)
           ) order by s.criado_em desc
         ), '[]'::jsonb)
    into v_res
    from public.comunidade_suspensoes s
    left join public.profiles p on p.id = s.user_id
   where s.revogada_em is null and (s.ate is null or s.ate > now());

  return v_res;
end;
$$;

revoke all on function public.admin_comunidade_suspensoes() from public, anon;
grant execute on function public.admin_comunidade_suspensoes() to authenticated;

-- 5. Aviso de abertura para quem pediu ------------------------------------------------------
-- Quem clicou em "Quero ser avisado" (etapa 4) recebe um aviso no sino,
-- uma vez só (a chave em notificacoes_enviadas impede repetir, mesmo
-- rodando o script de novo).
with novos as (
  insert into public.notificacoes_enviadas (user_id, chave)
  select i.user_id, 'comunidade-aberta'
    from public.interesse_comunidade i
  on conflict (user_id, chave) do nothing
  returning user_id
)
insert into public.notificacoes (user_id, tipo, titulo, texto, link)
select n.user_id,
       'comunidade',
       'A Comunidade abriu!',
       'Você pediu para ser avisado: o feed da comunidade já está no ar. Compartilhe layouts, ferramentas, dúvidas e conquistas.',
       '/painel/comunidade'
  from novos n;

notify pgrst, 'reload schema';
