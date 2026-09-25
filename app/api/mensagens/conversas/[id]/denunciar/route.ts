import { NextResponse } from "next/server";
import { exigirUsuario, lerId } from "@/lib/comunidade/servidor";
import { respostaErroChat } from "@/lib/mensagens/servidor";
import { DETALHE_DENUNCIA_MAX, ehMotivoDenuncia } from "@/lib/mensagens/regras";

export const dynamic = "force-dynamic";

// Denunciar uma conversa. A função SQL guarda uma cópia das últimas 30
// mensagens para a Gestão (é a única forma de a administração ler algo
// do chat). { bloquear: true } também bloqueia a pessoa.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;
  const { supabase } = acesso;
  const id = lerId((await params).id);

  const corpo = await request.json().catch(() => null);
  const motivo = corpo?.motivo;
  const detalhe = typeof corpo?.detalhe === "string" ? corpo.detalhe.trim() : "";
  if (!id) return NextResponse.json({ erro: "Conversa inválida." }, { status: 400 });
  if (!ehMotivoDenuncia(motivo)) return NextResponse.json({ erro: "Escolha o motivo da denúncia." }, { status: 400 });
  if ([...detalhe].length > DETALHE_DENUNCIA_MAX) {
    return NextResponse.json({ erro: `O detalhe pode ter no máximo ${DETALHE_DENUNCIA_MAX} caracteres.` }, { status: 400 });
  }

  const { error } = await supabase.rpc("chat_denunciar", {
    p_conversa: id,
    p_motivo: motivo,
    p_detalhe: detalhe || null,
  });
  if (error) return respostaErroChat(error, "mensagens/denunciar");

  // Bloquear junto: primeiro a denúncia (que precisa ler a conversa).
  if (corpo?.bloquear === true) {
    const { data: conversa } = await supabase.rpc("chat_conversa", { p_conversa: id });
    const apelido = (conversa as { outro?: { apelido?: string | null } } | null)?.outro?.apelido;
    if (apelido) {
      const { error: erroBloqueio } = await supabase.rpc("chat_bloquear", { p_apelido: apelido, p_bloquear: true });
      if (erroBloqueio) return respostaErroChat(erroBloqueio, "mensagens/denunciar-bloquear");
    }
  }
  return NextResponse.json({ ok: true });
}
