-- Ártemis Prospect — Etapa 16, parte 2 de 3: Mensagens (pedir conversa,
-- aceitar, enviar, ler, bloquear e denunciar)
-- Rode DEPOIS da parte 1 (etapa16-1), inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- Todas as funções usam o usuário logado (auth.uid()): não existe
-- parâmetro de "id do usuário", então ninguém age em nome de outra
-- pessoa. A outra pessoa é sempre indicada pelo APELIDO ou pela conversa;
-- o id dela nunca sai daqui.
-- Os erros "de regra" usam os mesmos códigos da Comunidade (etapa 14):
--   AP402 = recurso dos planos Solo e Pro (o site mostra o convite para assinar);
--   AP423 = conta suspensa da comunidade (a suspensão vale para o chat também);
--   AP428 = falta aceitar as regras do chat;
--   AP429 = limite de pedidos por dia ou de mensagens por minuto.

-- 1. Peças internas ----------------------------------------------------------------------
-- Existe bloqueio entre as duas pessoas (em qualquer sentido)?
create or replace function public.chat_bloqueio_entre(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_bloqueios
     where (user_id = p_a and bloqueado_id = p_b)
        or (user_id = p_b and bloqueado_id = p_a)
  );
$$;

revoke all on function public.chat_bloqueio_entre(uuid, uuid) from public, anon, authenticated;

-- Conversas abertas (aceitas) de uma pessoa agora.
create or replace function public.chat_ativas(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.chat_conversas
   where p_user in (user_a, user_b) and situacao = 'aceita';
$$;

revoke all on function public.chat_ativas(uuid) from public, anon, authenticated;

-- No Grátis, só as 3 conversas abertas mais antigas aceitam resposta
-- (isso só acontece com quem tinha mais de 3 no Solo/Pro e voltou para o
-- Grátis; aceitar uma 4ª conversa no Grátis já é recusado).
create or replace function public.chat_dentro_do_limite(p_user uuid, p_conversa bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.comunidade_acesso_total(p_user) or p_conversa in (
    select c.id from public.chat_conversas c
     where p_user in (c.user_a, c.user_b) and c.situacao = 'aceita'
     order by c.aceita_em asc nulls last, c.id asc
     limit (select conversas_gratis from public.chat_limites())
  );
$$;

revoke all on function public.chat_dentro_do_limite(uuid, bigint) from public, anon, authenticated;

-- Conferência da conta antes de pedir, aceitar ou enviar: trava o
-- perfil (dois envios ao mesmo tempo não furam o limite), confere o
-- aceite das regras e a suspensão. Devolve se a pessoa tem plano pago.
create or replace function public.chat_conferir_conta()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_susp timestamptz;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;

  perform 1 from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'Perfil não encontrado.';
  end if;

  if not exists (
    select 1 from public.chat_aceites
     where user_id = v_uid and versao = public.chat_versao_regras()
  ) then
    raise exception 'Leia e aceite as regras das mensagens antes de continuar.'
      using errcode = 'AP428';
  end if;

  v_susp := public.comunidade_suspenso_ate(v_uid);
  if v_susp is not null then
    if v_susp = 'infinity'::timestamptz then
      raise exception 'Sua conta foi suspensa da comunidade de forma definitiva. Você pode ler suas conversas, mas não pode enviar mensagens nem pedidos.'
        using errcode = 'AP423';
    end if;
    raise exception 'Sua conta está suspensa da comunidade até %. Até lá, você pode ler suas conversas, mas não pode enviar mensagens nem pedidos.',
      to_char(v_susp at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
      using errcode = 'AP423';
  end if;

  return public.comunidade_acesso_total(v_uid);
end;
$$;

revoke all on function public.chat_conferir_conta() from public, anon, authenticated;

-- Confere o limite e já conta o uso (pedido, mensagem ou denúncia). Se a
-- ação falhar depois, o banco desfaz a contagem junto.
create or replace function public.chat_contar(p_tipo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lim record;
  v_qtd integer;
begin
  select * into v_lim from public.chat_limites();

  if p_tipo = 'pedido' then
    select count(*) into v_qtd from public.chat_uso
     where user_id = v_uid and tipo = 'pedido' and criado_em >= public.comunidade_inicio_do_dia();
    if v_qtd >= v_lim.pedidos_dia then
      raise exception 'Você chegou ao limite de % pedidos de conversa por dia. Volte amanhã.', v_lim.pedidos_dia
        using errcode = 'AP429';
    end if;
    select count(*) into v_qtd from public.chat_conversas
     where pedido_por = v_uid and situacao = 'pendente';
    if v_qtd >= v_lim.pedidos_pendentes then
      raise exception 'Você já tem % pedidos esperando resposta. Aguarde as respostas ou cancele alguns.', v_qtd
        using errcode = 'AP429';
    end if;
  elsif p_tipo = 'mensagem' then
    select count(*) into v_qtd from public.chat_uso
     where user_id = v_uid and tipo = 'mensagem' and criado_em > now() - interval '1 minute';
    if v_qtd >= v_lim.mensagens_minuto then
      raise exception 'Calma! Você mandou % mensagens no último minuto. Espere um pouco para mandar mais.', v_qtd
        using errcode = 'AP429';
    end if;
  elsif p_tipo = 'denuncia' then
    select count(*) into v_qtd from public.chat_uso
     where user_id = v_uid and tipo = 'denuncia' and criado_em >= public.comunidade_inicio_do_dia();
    if v_qtd >= v_lim.denuncias_dia then
      raise exception 'Você chegou ao limite de % denúncias por dia. Volte amanhã.', v_lim.denuncias_dia
        using errcode = 'AP429';
    end if;
  else
    raise exception 'Tipo de uso inválido.';
  end if;

  insert into public.chat_uso (user_id, tipo) values (v_uid, p_tipo);

  -- Faxina de vez em quando: contagens com mais de 7 dias não servem mais.
  if random() < 0.02 then
    delete from public.chat_uso where criado_em < now() - interval '7 days';
  end if;
end;
$$;

revoke all on function public.chat_contar(text) from public, anon, authenticated;

-- A conversa, se o usuário logado participa dela (senão, erro).
create or replace function public.chat_minha_conversa(p_conversa bigint, p_travar boolean default false)
returns public.chat_conversas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.chat_conversas%rowtype;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;
  if p_travar then
    select * into v_c from public.chat_conversas where id = p_conversa for update;
  else
    select * into v_c from public.chat_conversas where id = p_conversa;
  end if;
  if v_c.id is null or auth.uid() not in (v_c.user_a, v_c.user_b) then
    raise exception 'Conversa não encontrada.';
  end if;
  return v_c;
end;
$$;

revoke all on function public.chat_minha_conversa(bigint, boolean) from public, anon, authenticated;

-- Pode enviar mensagem nesta conversa agora? (sem erro: só sim ou não)
-- Usada pela regra do bucket, para recusar a imagem já no envio.
create or replace function public.chat_pode_enviar(p_conversa bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select c.situacao = 'aceita'
       and not public.chat_bloqueio_entre(c.user_a, c.user_b)
       and public.comunidade_suspenso_ate(auth.uid()) is null
       and public.chat_dentro_do_limite(auth.uid(), c.id)
      from public.chat_conversas c
     where c.id = p_conversa and auth.uid() in (c.user_a, c.user_b)
  ), false);
$$;

revoke all on function public.chat_pode_enviar(bigint) from public, anon;
grant execute on function public.chat_pode_enviar(bigint) to authenticated;

create or replace function public.chat_pode_enviar_pasta(p_pasta text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_pasta ~ '^[0-9]{1,18}$' then public.chat_pode_enviar(p_pasta::bigint)
    else false
  end;
$$;

revoke all on function public.chat_pode_enviar_pasta(text) from public, anon;
grant execute on function public.chat_pode_enviar_pasta(text) to authenticated;

-- Regra do bucket para ENVIAR imagem: só na pasta "<conversa>/<eu>/",
-- só em conversa aberta, sem bloqueio, sem suspensão e dentro do plano.
drop policy if exists "Mensagens: envia imagem na conversa aberta" on storage.objects;
create policy "Mensagens: envia imagem na conversa aberta"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'mensagens'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.chat_pode_enviar_pasta((storage.foldername(name))[1])
  );

-- A outra pessoa (apelido e avatar; nunca e-mail, nome real ou id).
create or replace function public.chat_pessoa_json(p_user uuid)
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

revoke all on function public.chat_pessoa_json(uuid) from public, anon, authenticated;

-- Uma conversa em JSON, do ponto de vista de p_viewer.
create or replace function public.chat_conversa_json(c public.chat_conversas, p_viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id,
    'situacao', c.situacao,
    'eu_pedi', c.pedido_por = p_viewer,
    'pedido_em', c.pedido_em,
    'aceita_em', c.aceita_em,
    'encerrada_em', c.encerrada_em,
    'encerrada_por_mim', coalesce(c.encerrada_por = p_viewer, false),
    'outro', public.chat_pessoa_json(case when c.user_a = p_viewer then c.user_b else c.user_a end),
    'atualizado_em', greatest(c.pedido_em, coalesce(c.aceita_em, c.pedido_em), coalesce(c.ultima_msg_em, c.pedido_em),
                              coalesce(c.encerrada_em, c.pedido_em)),
    'nao_lidas', (select count(*) from public.chat_mensagens m
                   where m.conversa_id = c.id and m.autor_id <> p_viewer and m.lida_em is null),
    'ultima', (select jsonb_build_object(
                        'texto', left(m.texto, 140),
                        'imagem', m.imagem is not null,
                        'minha', m.autor_id = p_viewer,
                        'criado_em', m.criado_em,
                        'lida', m.lida_em is not null)
                 from public.chat_mensagens m
                where m.conversa_id = c.id
                order by m.id desc limit 1),
    'pode_enviar', c.situacao = 'aceita'
                   and not public.chat_bloqueio_entre(c.user_a, c.user_b)
                   and public.chat_dentro_do_limite(p_viewer, c.id),
    'fora_do_limite', c.situacao = 'aceita' and not public.chat_dentro_do_limite(p_viewer, c.id)
  );
$$;

revoke all on function public.chat_conversa_json(public.chat_conversas, uuid) from public, anon, authenticated;

-- 2. Estado do usuário no chat (para a tela) ------------------------------------------------
create or replace function public.chat_meu_estado()
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
  select * into v_lim from public.chat_limites();
  v_total := public.comunidade_acesso_total(v_uid);
  v_susp := public.comunidade_suspenso_ate(v_uid);

  return jsonb_build_object(
    'acesso_total', v_total,
    'regras_aceitas', exists (
      select 1 from public.chat_aceites
       where user_id = v_uid and versao = public.chat_versao_regras()),
    'suspenso', v_susp is not null,
    'suspenso_ate', case when v_susp is null or v_susp = 'infinity'::timestamptz then null else v_susp end,
    'ativas', public.chat_ativas(v_uid),
    'limite_ativas', case when v_total then null else v_lim.conversas_gratis end,
    'pedidos_hoje', (select count(*) from public.chat_uso
                      where user_id = v_uid and tipo = 'pedido' and criado_em >= public.comunidade_inicio_do_dia()),
    'limite_pedidos', v_lim.pedidos_dia,
    'apelido', (select apelido from public.profiles where id = v_uid)
  );
end;
$$;

revoke all on function public.chat_meu_estado() from public, anon;
grant execute on function public.chat_meu_estado() to authenticated;

-- Números do menu: mensagens não lidas e pedidos recebidos esperando.
-- Conversas com quem eu bloqueei não contam.
create or replace function public.chat_resumo()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with minhas as (
    select c.*
      from public.chat_conversas c
     where auth.uid() in (c.user_a, c.user_b)
       and not exists (
         select 1 from public.chat_bloqueios b
          where b.user_id = auth.uid()
            and b.bloqueado_id = case when c.user_a = auth.uid() then c.user_b else c.user_a end)
  )
  select jsonb_build_object(
    'nao_lidas', (select count(*) from public.chat_mensagens m
                   join minhas c on c.id = m.conversa_id
                  where m.autor_id <> auth.uid() and m.lida_em is null),
    'pedidos', (select count(*) from minhas c
                 where c.situacao = 'pendente' and c.pedido_por <> auth.uid())
  )
  where auth.uid() is not null;
$$;

revoke all on function public.chat_resumo() from public, anon;
grant execute on function public.chat_resumo() to authenticated;

-- 3. Aceitar as regras do chat ------------------------------------------------------------
create or replace function public.chat_aceitar_regras()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado.';
  end if;
  insert into public.chat_aceites (user_id, versao)
  values (auth.uid(), public.chat_versao_regras())
  on conflict (user_id, versao) do nothing;
end;
$$;

revoke all on function public.chat_aceitar_regras() from public, anon;
grant execute on function public.chat_aceitar_regras() to authenticated;

-- 4. Pedir conversa (pelo perfil da pessoa na comunidade) ------------------------------------
-- Só Solo e Pro iniciam conversas; o Grátis responde. Nada é entregue
-- à outra pessoa além do pedido: mensagens só depois de aceito.
-- Devolve o id da conversa.
create or replace function public.chat_pedir(p_apelido text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_outro uuid;
  v_total boolean;
  v_a uuid;
  v_b uuid;
  v_c public.chat_conversas%rowtype;
  v_lim record;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;

  select id into v_outro from public.profiles
   where lower(apelido) = lower(btrim(coalesce(p_apelido, '')));
  if v_outro is null then
    raise exception 'Usuário não encontrado.';
  end if;
  if v_outro = v_uid then
    raise exception 'Você não pode conversar com você mesmo.';
  end if;

  v_total := public.chat_conferir_conta();
  if not v_total then
    raise exception 'No plano Grátis você responde conversas, mas não inicia. Assine o Solo ou o Pro para enviar pedidos de conversa.'
      using errcode = 'AP402';
  end if;

  if exists (select 1 from public.chat_bloqueios where user_id = v_uid and bloqueado_id = v_outro) then
    raise exception 'Você bloqueou essa pessoa. Desbloqueie em Mensagens > Bloqueados para enviar um pedido.';
  end if;
  if exists (select 1 from public.chat_bloqueios where user_id = v_outro and bloqueado_id = v_uid) then
    raise exception 'Não é possível enviar pedido de conversa para essa pessoa.';
  end if;

  v_a := least(v_uid, v_outro);
  v_b := greatest(v_uid, v_outro);
  select * into v_c from public.chat_conversas where user_a = v_a and user_b = v_b for update;

  if v_c.id is not null then
    if v_c.situacao = 'aceita' then
      return v_c.id;
    end if;
    if v_c.situacao = 'pendente' then
      if v_c.pedido_por = v_uid then
        raise exception 'Você já enviou um pedido para essa pessoa. Aguarde a resposta.';
      end if;
      raise exception 'Essa pessoa já te enviou um pedido de conversa. Aceite em Mensagens.';
    end if;
    -- Recusou ou desfez a conversa: quem recusou pode pedir quando
    -- quiser; a outra pessoa espera alguns dias.
    select * into v_lim from public.chat_limites();
    if v_c.situacao in ('recusada', 'encerrada')
       and v_c.encerrada_por is not null and v_c.encerrada_por <> v_uid
       and v_c.encerrada_em > now() - make_interval(days => v_lim.dias_novo_pedido) then
      raise exception 'Essa pessoa não quer conversar agora. Você pode tentar de novo a partir de %.',
        to_char((v_c.encerrada_em + make_interval(days => v_lim.dias_novo_pedido)) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY');
    end if;

    perform public.chat_contar('pedido');
    update public.chat_conversas
       set situacao = 'pendente', pedido_por = v_uid, pedido_em = now(),
           aceita_em = null, encerrada_em = null, encerrada_por = null
     where id = v_c.id;
    return v_c.id;
  end if;

  perform public.chat_contar('pedido');
  insert into public.chat_conversas (user_a, user_b, pedido_por)
  values (v_a, v_b, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.chat_pedir(text) from public, anon;
grant execute on function public.chat_pedir(text) to authenticated;

-- 5. Aceitar um pedido recebido ------------------------------------------------------------
-- No Grátis, aceita enquanto tiver menos de 3 conversas abertas.
create or replace function public.chat_aceitar(p_conversa bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.chat_conversas%rowtype;
  v_total boolean;
  v_lim record;
begin
  v_total := public.chat_conferir_conta();
  v_c := public.chat_minha_conversa(p_conversa, true);

  if v_c.situacao <> 'pendente' or v_c.pedido_por = v_uid then
    raise exception 'Não há pedido esperando a sua resposta nesta conversa.';
  end if;
  if public.chat_bloqueio_entre(v_c.user_a, v_c.user_b) then
    raise exception 'Não é possível aceitar este pedido.';
  end if;

  select * into v_lim from public.chat_limites();
  if not v_total and public.chat_ativas(v_uid) >= v_lim.conversas_gratis then
    raise exception 'No plano Grátis você mantém até % conversas abertas. Desfaça uma conversa ou assine o Solo ou o Pro para ter conversas sem limite.',
      v_lim.conversas_gratis
      using errcode = 'AP402';
  end if;

  update public.chat_conversas
     set situacao = 'aceita', aceita_em = now(), encerrada_em = null, encerrada_por = null
   where id = v_c.id;
end;
$$;

revoke all on function public.chat_aceitar(bigint) from public, anon;
grant execute on function public.chat_aceitar(bigint) to authenticated;

-- 6. Recusar, cancelar ou desfazer ------------------------------------------------------------
-- Uma função para as três saídas:
--   pedido recebido → recusada;  pedido que eu fiz → cancelada;
--   conversa aberta → encerrada (qualquer um dos dois pode desfazer).
-- Vale mesmo para quem está suspenso (sair nunca é bloqueado).
create or replace function public.chat_encerrar(p_conversa bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.chat_conversas%rowtype;
  v_nova text;
begin
  v_c := public.chat_minha_conversa(p_conversa, true);

  if v_c.situacao = 'pendente' then
    v_nova := case when v_c.pedido_por = v_uid then 'cancelada' else 'recusada' end;
  elsif v_c.situacao = 'aceita' then
    v_nova := 'encerrada';
  else
    raise exception 'Esta conversa já está encerrada.';
  end if;

  update public.chat_conversas
     set situacao = v_nova, encerrada_em = now(), encerrada_por = v_uid
   where id = v_c.id;
  return v_nova;
end;
$$;

revoke all on function public.chat_encerrar(bigint) from public, anon;
grant execute on function public.chat_encerrar(bigint) to authenticated;

-- 7. Enviar mensagem ---------------------------------------------------------------------------
-- p_texto: até 1000 caracteres. p_imagem: caminho já enviado ao bucket
-- "mensagens", na pasta "<conversa>/<eu>/" (o servidor já conferiu que o
-- arquivo é mesmo uma imagem). Precisa de texto ou imagem.
create or replace function public.chat_enviar(p_conversa bigint, p_texto text, p_imagem text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_texto text := btrim(coalesce(p_texto, ''));
  v_imagem text := nullif(btrim(coalesce(p_imagem, '')), '');
  v_c public.chat_conversas%rowtype;
  v_lim record;
  v_m public.chat_mensagens%rowtype;
begin
  if char_length(v_texto) > 1000 then
    raise exception 'A mensagem pode ter no máximo 1000 caracteres.';
  end if;
  if v_texto = '' and v_imagem is null then
    raise exception 'Escreva uma mensagem ou escolha uma imagem.';
  end if;

  perform public.chat_conferir_conta();
  v_c := public.chat_minha_conversa(p_conversa);

  if v_c.situacao = 'pendente' then
    raise exception 'A conversa ainda não foi aceita. As mensagens só são entregues depois do aceite.';
  end if;
  if v_c.situacao <> 'aceita' then
    raise exception 'Esta conversa foi encerrada. Não é possível enviar mensagens.';
  end if;
  if public.chat_bloqueio_entre(v_c.user_a, v_c.user_b) then
    raise exception 'Não é possível enviar mensagens nesta conversa.';
  end if;
  if not public.chat_dentro_do_limite(v_uid, v_c.id) then
    select * into v_lim from public.chat_limites();
    raise exception 'No plano Grátis você responde em até % conversas abertas. Desfaça outra conversa ou assine o Solo ou o Pro.',
      v_lim.conversas_gratis
      using errcode = 'AP402';
  end if;

  if v_imagem is not null then
    if v_imagem !~ ('^' || v_c.id::text || '/' || v_uid::text || '/[0-9]{10,16}-[a-z0-9]{4,16}\.(webp|jpg)$') then
      raise exception 'Imagem inválida.';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'mensagens' and name = v_imagem) then
      raise exception 'A imagem não foi encontrada. Envie de novo.';
    end if;
    if exists (select 1 from public.chat_mensagens where imagem = v_imagem) then
      raise exception 'Essa imagem já foi enviada.';
    end if;
  end if;

  perform public.chat_contar('mensagem');

  insert into public.chat_mensagens (conversa_id, autor_id, texto, imagem)
  values (v_c.id, v_uid, v_texto, v_imagem)
  returning * into v_m;

  update public.chat_conversas set ultima_msg_em = v_m.criado_em where id = v_c.id;

  return jsonb_build_object(
    'id', v_m.id,
    'minha', true,
    'texto', v_m.texto,
    'imagem', v_m.imagem,
    'criado_em', v_m.criado_em,
    'lida_em', v_m.lida_em
  );
end;
$$;

revoke all on function public.chat_enviar(bigint, text, text) from public, anon;
grant execute on function public.chat_enviar(bigint, text, text) to authenticated;

-- 8. Marcar como lidas -------------------------------------------------------------------------
-- As mensagens da outra pessoa nesta conversa passam a "lida" (quem
-- enviou vê o sinal de lida na hora, pelo tempo real).
create or replace function public.chat_marcar_lidas(p_conversa bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.chat_conversas%rowtype;
  v_qtd integer;
begin
  v_c := public.chat_minha_conversa(p_conversa);
  update public.chat_mensagens
     set lida_em = now()
   where conversa_id = v_c.id and autor_id <> auth.uid() and lida_em is null;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

revoke all on function public.chat_marcar_lidas(bigint) from public, anon;
grant execute on function public.chat_marcar_lidas(bigint) to authenticated;

-- 9. Lista de conversas --------------------------------------------------------------------------
-- p_busca: filtra pelo apelido da outra pessoa (parte do nome).
-- Aparecem: conversas abertas, pedidos (recebidos e enviados) e conversas
-- encerradas que têm mensagens. Conversas com quem EU bloqueei somem.
create or replace function public.chat_lista(p_busca text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
  v_res jsonb;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;
  if v_busca is not null then
    -- % e _ digitados valem como texto, não como curinga.
    v_busca := '%' || replace(replace(replace(lower(left(v_busca, 40)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  select coalesce(jsonb_agg(t.j order by t.ordem desc, t.id desc), '[]'::jsonb)
    into v_res
    from (
      select c.id,
             public.chat_conversa_json(c, v_uid) as j,
             greatest(c.pedido_em, coalesce(c.aceita_em, c.pedido_em), coalesce(c.ultima_msg_em, c.pedido_em)) as ordem
        from public.chat_conversas c
        join public.profiles p on p.id = case when c.user_a = v_uid then c.user_b else c.user_a end
       where v_uid in (c.user_a, c.user_b)
         and not exists (select 1 from public.chat_bloqueios b
                          where b.user_id = v_uid and b.bloqueado_id = p.id)
         and (c.situacao in ('aceita', 'pendente')
              or exists (select 1 from public.chat_mensagens m where m.conversa_id = c.id))
         and (v_busca is null or lower(p.apelido) like v_busca)
       order by 3 desc, c.id desc
       limit 200
    ) t;

  return v_res;
end;
$$;

revoke all on function public.chat_lista(text) from public, anon;
grant execute on function public.chat_lista(text) to authenticated;

-- 10. Uma conversa e as mensagens dela ------------------------------------------------------------
create or replace function public.chat_conversa(p_conversa bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.chat_conversas%rowtype;
begin
  v_c := public.chat_minha_conversa(p_conversa);
  return public.chat_conversa_json(v_c, auth.uid()) || jsonb_build_object(
    'eu_bloqueei', exists (
      select 1 from public.chat_bloqueios
       where user_id = auth.uid()
         and bloqueado_id = case when v_c.user_a = auth.uid() then v_c.user_b else v_c.user_a end)
  );
end;
$$;

revoke all on function public.chat_conversa(bigint) from public, anon;
grant execute on function public.chat_conversa(bigint) to authenticated;

-- p_antes: id da mensagem mais antiga já mostrada ("carregar anteriores").
-- Devolve da mais antiga para a mais nova.
create or replace function public.chat_mensagens_da_conversa(
  p_conversa bigint,
  p_antes bigint default null,
  p_limite integer default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.chat_conversas%rowtype;
  v_res jsonb;
begin
  v_c := public.chat_minha_conversa(p_conversa);

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', m.id,
             'minha', m.autor_id = auth.uid(),
             'texto', m.texto,
             'imagem', m.imagem,
             'criado_em', m.criado_em,
             'lida_em', m.lida_em
           ) order by m.id asc
         ), '[]'::jsonb)
    into v_res
    from (
      select * from public.chat_mensagens
       where conversa_id = v_c.id
         and (p_antes is null or id < p_antes)
       order by id desc
       limit least(greatest(coalesce(p_limite, 40), 1), 100)
    ) m;

  return v_res;
end;
$$;

revoke all on function public.chat_mensagens_da_conversa(bigint, bigint, integer) from public, anon;
grant execute on function public.chat_mensagens_da_conversa(bigint, bigint, integer) to authenticated;

-- 11. Relação com alguém (para o botão no perfil da comunidade) ----------------------------------
-- Não conta se a OUTRA pessoa me bloqueou (isso só aparece ao tentar).
create or replace function public.chat_relacao(p_apelido text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_outro uuid;
  v_c public.chat_conversas%rowtype;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;
  select id into v_outro from public.profiles
   where lower(apelido) = lower(btrim(coalesce(p_apelido, '')));
  if v_outro is null or v_outro = v_uid then
    return null;
  end if;

  select * into v_c from public.chat_conversas
   where user_a = least(v_uid, v_outro) and user_b = greatest(v_uid, v_outro);

  return jsonb_build_object(
    'conversa_id', v_c.id,
    'situacao', v_c.situacao,
    'eu_pedi', coalesce(v_c.pedido_por = v_uid, false),
    'eu_bloqueei', exists (select 1 from public.chat_bloqueios where user_id = v_uid and bloqueado_id = v_outro),
    'acesso_total', public.comunidade_acesso_total(v_uid)
  );
end;
$$;

revoke all on function public.chat_relacao(text) from public, anon;
grant execute on function public.chat_relacao(text) to authenticated;

-- 12. Bloquear e desbloquear ---------------------------------------------------------------------
-- Bloquear: a conversa com a pessoa é encerrada (pedido pendente é
-- recusado/cancelado), some da minha lista e ninguém manda pedido para
-- ninguém enquanto durar o bloqueio. Desbloquear NÃO reabre a conversa:
-- é preciso um pedido novo.
create or replace function public.chat_bloquear(p_apelido text, p_bloquear boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_outro uuid;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado.';
  end if;
  select id into v_outro from public.profiles
   where lower(apelido) = lower(btrim(coalesce(p_apelido, '')));
  if v_outro is null then
    raise exception 'Usuário não encontrado.';
  end if;
  if v_outro = v_uid then
    raise exception 'Você não pode bloquear você mesmo.';
  end if;

  if coalesce(p_bloquear, true) then
    insert into public.chat_bloqueios (user_id, bloqueado_id)
    values (v_uid, v_outro)
    on conflict do nothing;

    update public.chat_conversas
       set situacao = case
             when situacao = 'aceita' then 'encerrada'
             when pedido_por = v_uid then 'cancelada'
             else 'recusada'
           end,
           encerrada_em = now(),
           encerrada_por = v_uid
     where user_a = least(v_uid, v_outro) and user_b = greatest(v_uid, v_outro)
       and situacao in ('aceita', 'pendente');
  else
    delete from public.chat_bloqueios where user_id = v_uid and bloqueado_id = v_outro;
  end if;
end;
$$;

revoke all on function public.chat_bloquear(text, boolean) from public, anon;
grant execute on function public.chat_bloquear(text, boolean) to authenticated;

-- Quem eu bloqueei (para desbloquear, se quiser).
create or replace function public.chat_bloqueados()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
           public.chat_pessoa_json(b.bloqueado_id) || jsonb_build_object('desde', b.criado_em)
           order by b.criado_em desc
         ), '[]'::jsonb)
    from public.chat_bloqueios b
   where b.user_id = auth.uid();
$$;

revoke all on function public.chat_bloqueados() from public, anon;
grant execute on function public.chat_bloqueados() to authenticated;

-- 13. Denunciar conversa ------------------------------------------------------------------------
-- Vai para a Gestão uma CÓPIA das últimas 30 mensagens (das duas
-- pessoas), com o motivo. É a única forma de a administração ler algo
-- do chat — e as regras do chat avisam isso. Uma denúncia pendente por
-- pessoa por conversa. Vale mesmo para quem está suspenso.
-- Motivo: assedio | spam | ofensivo | golpe | improprio | outro.
create or replace function public.chat_denunciar(p_conversa bigint, p_motivo text, p_detalhe text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_detalhe text := nullif(btrim(coalesce(p_detalhe, '')), '');
  v_c public.chat_conversas%rowtype;
  v_outro uuid;
  v_copia jsonb;
begin
  if p_motivo is null or p_motivo not in ('assedio', 'spam', 'ofensivo', 'golpe', 'improprio', 'outro') then
    raise exception 'Escolha o motivo da denúncia.';
  end if;
  if char_length(v_detalhe) > 500 then
    raise exception 'O detalhe pode ter no máximo 500 caracteres.';
  end if;

  v_c := public.chat_minha_conversa(p_conversa);
  v_outro := case when v_c.user_a = v_uid then v_c.user_b else v_c.user_a end;

  if not exists (select 1 from public.chat_mensagens where conversa_id = v_c.id and autor_id = v_outro) then
    raise exception 'A outra pessoa ainda não mandou mensagens nesta conversa. Se não quiser receber o pedido, recuse ou bloqueie.';
  end if;
  if exists (
    select 1 from public.chat_denuncias
     where denunciante_id = v_uid and conversa_id = v_c.id and situacao = 'pendente'
  ) then
    raise exception 'Você já denunciou esta conversa. A moderação vai analisar.';
  end if;

  perform public.chat_contar('denuncia');

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', m.id,
             'de', case when m.autor_id = v_uid then 'denunciante' else 'denunciado' end,
             'texto', m.texto,
             'imagem', m.imagem,
             'criado_em', m.criado_em
           ) order by m.id asc
         ), '[]'::jsonb)
    into v_copia
    from (
      select * from public.chat_mensagens
       where conversa_id = v_c.id
       order by id desc
       limit 30
    ) m;

  insert into public.chat_denuncias (conversa_id, denunciante_id, denunciado_id, motivo, detalhe, mensagens)
  values (v_c.id, v_uid, v_outro, p_motivo, v_detalhe, v_copia);
exception
  when unique_violation then
    raise exception 'Você já denunciou esta conversa. A moderação vai analisar.';
end;
$$;

revoke all on function public.chat_denunciar(bigint, text, text) from public, anon;
grant execute on function public.chat_denunciar(bigint, text, text) to authenticated;

notify pgrst, 'reload schema';
