import { NextResponse } from "next/server";
import { exigirUsuario, lerId } from "@/lib/comunidade/servidor";
import { respostaErroChat } from "@/lib/mensagens/servidor";

export const dynamic = "force-dynamic";

// Marca como lidas as mensagens da outra pessoa nesta conversa.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;
  const id = lerId((await params).id);
  if (!id) return NextResponse.json({ erro: "Conversa inválida." }, { status: 400 });

  const { data, error } = await acesso.supabase.rpc("chat_marcar_lidas", { p_conversa: id });
  if (error) return respostaErroChat(error, "mensagens/lidas");
  return NextResponse.json({ marcadas: data ?? 0 });
}
