import { NextResponse } from "next/server";
import { exigirUsuario, lerId } from "@/lib/comunidade/servidor";
import { respostaErroChat } from "@/lib/mensagens/servidor";

export const dynamic = "force-dynamic";

// Dados de uma conversa (só de quem participa: o banco confere).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;
  const id = lerId((await params).id);
  if (!id) return NextResponse.json({ erro: "Conversa inválida." }, { status: 400 });

  const { data, error } = await acesso.supabase.rpc("chat_conversa", { p_conversa: id });
  if (error) return respostaErroChat(error, "mensagens/conversa");
  return NextResponse.json({ conversa: data });
}

// { acao: "aceitar" } aceita um pedido recebido.
// { acao: "encerrar" } recusa um pedido recebido, cancela um pedido
// enviado ou desfaz uma conversa aberta.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;
  const id = lerId((await params).id);
  const acao = (await request.json().catch(() => null))?.acao;
  if (!id || (acao !== "aceitar" && acao !== "encerrar")) {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const { data, error } = await acesso.supabase.rpc(acao === "aceitar" ? "chat_aceitar" : "chat_encerrar", {
    p_conversa: id,
  });
  if (error) return respostaErroChat(error, `mensagens/${acao}`);
  return NextResponse.json({ ok: true, situacao: acao === "aceitar" ? "aceita" : data });
}
