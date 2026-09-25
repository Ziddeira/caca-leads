import { NextResponse } from "next/server";
import { exigirAdminApi } from "@/lib/admin/acesso";
import { apagarImagens, respostaErro } from "@/lib/comunidade/servidor";
import { MOTIVO_MODERACAO_MAX } from "@/lib/comunidade/regras";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Moderação da Comunidade (Gestão > Comunidade). Cada ação chama uma
// função SQL "admin_comunidade_*", que recusa quem não é administrador e
// grava quem moderou e quando (na linha e na auditoria).
//   { acao: "remover", tipo, id, motivo }
//   { acao: "descartar", tipo, id }
//   { acao: "suspender", userId, dias (1-365 ou null = definitiva), motivo }
//   { acao: "revogar", userId }
export async function POST(request: Request) {
  const acesso = await exigirAdminApi();
  if (acesso.resposta) return acesso.resposta;
  const { supabase } = acesso;

  const corpo = await request.json().catch(() => null);
  const acao = corpo?.acao;
  const tipo = corpo?.tipo;
  const id = Number(corpo?.id);
  const motivo = typeof corpo?.motivo === "string" ? corpo.motivo.trim() : "";
  const userId = typeof corpo?.userId === "string" && UUID.test(corpo.userId) ? corpo.userId : null;
  const alvoValido = (tipo === "post" || tipo === "comentario") && Number.isSafeInteger(id) && id > 0;

  if ([...motivo].length > MOTIVO_MODERACAO_MAX) {
    return NextResponse.json({ erro: `O motivo pode ter no máximo ${MOTIVO_MODERACAO_MAX} caracteres.` }, { status: 400 });
  }

  if (acao === "remover" && alvoValido) {
    if (!motivo) return NextResponse.json({ erro: "Escreva o motivo da remoção." }, { status: 400 });
    const { data, error } = await supabase.rpc("admin_comunidade_remover", { p_tipo: tipo, p_id: id, p_motivo: motivo });
    if (error) return respostaErro(error, "admin/comunidade");
    await apagarImagens(supabase, (data as string[] | null) ?? []);
    return NextResponse.json({ ok: true });
  }

  if (acao === "descartar" && alvoValido) {
    const { error } = await supabase.rpc("admin_comunidade_descartar", { p_tipo: tipo, p_id: id });
    if (error) return respostaErro(error, "admin/comunidade");
    return NextResponse.json({ ok: true });
  }

  if (acao === "suspender" && userId) {
    const dias = corpo?.dias === null ? null : Number(corpo?.dias);
    if (dias !== null && (!Number.isInteger(dias) || dias < 1 || dias > 365)) {
      return NextResponse.json({ erro: "A suspensão por tempo vai de 1 a 365 dias." }, { status: 400 });
    }
    if (!motivo) return NextResponse.json({ erro: "Escreva o motivo da suspensão." }, { status: 400 });
    const { data, error } = await supabase.rpc("admin_comunidade_suspender", {
      p_user: userId,
      p_dias: dias,
      p_motivo: motivo,
    });
    if (error) return respostaErro(error, "admin/comunidade");
    return NextResponse.json({ ate: data });
  }

  if (acao === "revogar" && userId) {
    const { error } = await supabase.rpc("admin_comunidade_revogar", { p_user: userId });
    if (error) return respostaErro(error, "admin/comunidade");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
}
