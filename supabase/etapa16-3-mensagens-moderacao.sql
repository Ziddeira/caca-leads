-- Ártemis Prospect — Etapa 16, parte 3 de 3: Mensagens (denúncias no
-- painel de Gestão)
-- Rode DEPOIS da parte 2 (etapa16-2), inteiro, de uma vez:
-- Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem problema (é idempotente).
--
-- A Gestão NÃO lê conversas. Ela só vê o que chegou por denúncia: a
-- cópia das últimas mensagens guardada no momento em que alguém
-- denunciou (chat_denuncias.mensagens). Todas as funções abaixo começam
-- perguntando public.eh_admin() (etapa 11) e recusam quem não é
-- administrador. Toda decisão fica registrada na própria denúncia e na
-- auditoria da Gestão (admin_auditoria).
--
-- Suspender: usa a mesma suspensão da Comunidade
-- (admin_comunidade_suspender, etapa 14). Quem está suspenso lê as
-- próprias conversas, mas não manda mensagem, pedido nem aceita pedidos.

-- 1. Fila de denúncias do chat ------------------------------------------------------------
--   p_situacao: pendente (padrão) | resolvida | descartada.
-- Cada item traz a cópia das mensagens, quem denunciou, quem foi
-- denunciado (com e-mail, para você identificar) e quantas denúncias
-- essa pessoa já recebeu no chat.
create or replace function public.admin_chat_denuncias(p_situacao text default 'pendente')
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

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', d.id,
             'conversa_id', d.conversa_id,
             'motivo', d.motivo,
             'detalhe', d.detalhe,
             'mensagens', d.mensagens,
             'criado_em', d.criado_em,
             'situacao', d.situacao,
             'decisao', d.decisao,
             'decidida_em', d.decidida_em,
             'decidida_por', (select email from public.profiles where id = d.decidida_por),
             'denunciante', (
               select jsonb_build_object('apelido', p.apelido, 'email', p.email)
                 from public.profiles p where p.id = d.denunciante_id),
             'denunciado', (
               select jsonb_build_object(
                 'id', p.id,
                 'apelido', p.apelido,
                 'email', p.email,
                 'suspenso_ate', public.comunidade_suspenso_ate(p.id),
                 'denuncias_recebidas', (select count(*) from public.chat_denuncias x
                                          where x.denunciado_id = p.id)
               )
                 from public.profiles p where p.id = d.denunciado_id)
           ) order by
             case when v_sit = 'pendente' then d.criado_em end asc,
             d.decidida_em desc nulls last,
             d.id desc
         ), '[]'::jsonb)
    into v_res
    from (
      select * from public.chat_denuncias
       where situacao = v_sit
       order by
         case when v_sit = 'pendente' then criado_em end asc,
         decidida_em desc nulls last,
         id desc
       limit 100
    ) d;

  return v_res;
end;
$$;

revoke all on function public.admin_chat_denuncias(text) from public, anon;
grant execute on function public.admin_chat_denuncias(text) to authenticated;

-- 2. Decidir uma denúncia --------------------------------------------------------------------
-- p_situacao: resolvida (você agiu, por exemplo suspendendo) |
-- descartada (não era caso de agir). p_nota: anotação sua (opcional,
-- só a Gestão vê).
create or replace function public.admin_chat_decidir(p_id bigint, p_situacao text, p_nota text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_d public.chat_denuncias%rowtype;
begin
  if not public.eh_admin() then
    raise exception 'Acesso restrito ao administrador.';
  end if;
  if p_situacao not in ('resolvida', 'descartada') then
    raise exception 'Decisão inválida.';
  end if;
  if char_length(v_nota) > 500 then
    raise exception 'A anotação pode ter no máximo 500 caracteres.';
  end if;

  select * into v_d from public.chat_denuncias where id = p_id for update;
  if v_d.id is null then
    raise exception 'Denúncia não encontrada.';
  end if;
  if v_d.situacao <> 'pendente' then
    raise exception 'Essa denúncia já foi decidida.';
  end if;

  update public.chat_denuncias
     set situacao = p_situacao,
         decisao = coalesce(v_nota, case when p_situacao = 'resolvida' then 'Resolvida' else 'Descartada' end),
         decidida_por = auth.uid(),
         decidida_em = now()
   where id = p_id;

  perform public.registrar_auditoria(
    case when p_situacao = 'resolvida' then 'chat_denuncia_resolvida' else 'chat_denuncia_descartada' end,
    v_d.denunciado_id,
    jsonb_build_object('denuncia_id', v_d.id, 'conversa_id', v_d.conversa_id, 'motivo', v_d.motivo),
    jsonb_build_object('situacao', p_situacao),
    v_nota
  );
end;
$$;

revoke all on function public.admin_chat_decidir(bigint, text, text) from public, anon;
grant execute on function public.admin_chat_decidir(bigint, text, text) to authenticated;

-- 3. Aviso de suspensão atualizado ----------------------------------------------------------
-- Mesma função da etapa 14, só com o texto do aviso dizendo que a
-- suspensão vale também para as mensagens.
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
      || 'Você continua lendo o feed e as suas conversas, mas não publica, comenta, curte nem envia mensagens. Motivo: ' || v_motivo,
      600
    ),
    '/painel/comunidade'
  );

  return v_ate;
end;
$$;

revoke all on function public.admin_comunidade_suspender(uuid, integer, text) from public, anon;
grant execute on function public.admin_comunidade_suspender(uuid, integer, text) to authenticated;

notify pgrst, 'reload schema';
