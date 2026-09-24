import { NextResponse } from "next/server";
import { exigirAdminApi, respostaErroAdmin } from "@/lib/admin/acesso";
import { RESPOSTA_MAX, ehSituacao } from "@/lib/suporte/regras";

export const dynamic = "force-dynamic";

// Responder e/ou mudar a situação de um chamado. A função SQL
// admin_responder_chamado confere o administrador, avisa o usuário no
// sino quando há resposta nova e grava na auditoria.
export async function POST(request: Request) {
  const acesso = await exigirAdminApi();
  if (acesso.resposta) return acesso.resposta;

  const corpo = await request.json().catch(() => null);
  const id = Number(corpo?.id);
  const resposta = typeof corpo?.resposta === "string" ? corpo.resposta.trim() : "";
  const situacao = corpo?.situacao;
  if (!Number.isInteger(id) || id <= 0 || !ehSituacao(situacao)) {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  if (resposta.length > RESPOSTA_MAX) {
    return NextResponse.json({ erro: `A resposta pode ter no máximo ${RESPOSTA_MAX} caracteres.` }, { status: 400 });
  }

  const { data, error } = await acesso.supabase.rpc("admin_responder_chamado", {
    p_id: id,
    p_resposta: resposta || null,
    p_situacao: situacao,
  });
  if (error) return respostaErroAdmin(error, "admin/suporte");
  return NextResponse.json({ situacao: data });
}
