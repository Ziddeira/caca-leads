import { NextResponse } from "next/server";
import { exigirUsuario, lerId, respostaErro } from "@/lib/comunidade/servidor";

export const dynamic = "force-dynamic";

// Apagar um comentário: o autor apaga o próprio; o administrador apaga
// qualquer um (com registro na auditoria). Quem confere é a função SQL.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;

  const id = lerId((await params).id);
  if (!id) return NextResponse.json({ erro: "Comentário inválido." }, { status: 400 });

  const { error } = await acesso.supabase.rpc("comunidade_apagar_comentario", { p_id: id });
  if (error) return respostaErro(error, "comunidade/apagar-comentario");
  return NextResponse.json({ ok: true });
}
