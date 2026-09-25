import { NextResponse } from "next/server";
import { apagarImagens, exigirUsuario, lerId, respostaErro } from "@/lib/comunidade/servidor";

export const dynamic = "force-dynamic";

// Apagar um post. A função SQL só deixa o autor (ou o administrador, com
// registro na auditoria) e devolve as imagens, que saem do Storage aqui.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;

  const id = lerId((await params).id);
  if (!id) return NextResponse.json({ erro: "Post inválido." }, { status: 400 });

  const { data, error } = await acesso.supabase.rpc("comunidade_apagar_post", { p_id: id });
  if (error) return respostaErro(error, "comunidade/apagar-post");

  await apagarImagens(acesso.supabase, (data as string[] | null) ?? []);
  return NextResponse.json({ ok: true });
}
