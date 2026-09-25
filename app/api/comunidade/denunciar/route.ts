import { NextResponse } from "next/server";
import { exigirUsuario, respostaErro } from "@/lib/comunidade/servidor";
import { DETALHE_DENUNCIA_MAX, ehMotivoDenuncia } from "@/lib/comunidade/regras";

export const dynamic = "force-dynamic";

// Denunciar um post ou comentário, com motivo. Uma denúncia por pessoa
// por conteúdo; ninguém denuncia o próprio (a função SQL confere).
export async function POST(request: Request) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;

  const corpo = await request.json().catch(() => null);
  const tipo = corpo?.tipo;
  const id = Number(corpo?.id);
  const motivo = corpo?.motivo;
  const detalhe = typeof corpo?.detalhe === "string" ? corpo.detalhe.trim() : "";

  if ((tipo !== "post" && tipo !== "comentario") || !Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  if (!ehMotivoDenuncia(motivo)) {
    return NextResponse.json({ erro: "Escolha o motivo da denúncia." }, { status: 400 });
  }
  if ([...detalhe].length > DETALHE_DENUNCIA_MAX) {
    return NextResponse.json({ erro: `O detalhe pode ter no máximo ${DETALHE_DENUNCIA_MAX} caracteres.` }, { status: 400 });
  }

  const { error } = await acesso.supabase.rpc("comunidade_denunciar", {
    p_tipo: tipo,
    p_id: id,
    p_motivo: motivo,
    p_detalhe: detalhe || null,
  });
  if (error) return respostaErro(error, "comunidade/denunciar");
  return NextResponse.json({ ok: true });
}
