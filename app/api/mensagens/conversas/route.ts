import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/comunidade/servidor";
import { respostaErroChat } from "@/lib/mensagens/servidor";
import { BUSCA_MAX } from "@/lib/mensagens/regras";

export const dynamic = "force-dynamic";

// Lista de conversas do usuário logado (?busca= filtra pelo apelido).
export async function GET(request: Request) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;
  const busca = (new URL(request.url).searchParams.get("busca") ?? "").trim().slice(0, BUSCA_MAX);
  const { data, error } = await acesso.supabase.rpc("chat_lista", { p_busca: busca || null });
  if (error) return respostaErroChat(error, "mensagens/lista");
  return NextResponse.json({ conversas: data ?? [] });
}

// Pedir conversa a alguém (pelo apelido). Só Solo e Pro; limite de
// pedidos por dia, bloqueio e "recusou há pouco" conferidos no banco.
export async function POST(request: Request) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;
  const corpo = await request.json().catch(() => null);
  const apelido = typeof corpo?.apelido === "string" ? corpo.apelido.trim().slice(0, BUSCA_MAX) : "";
  if (!apelido) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });

  const { data, error } = await acesso.supabase.rpc("chat_pedir", { p_apelido: apelido });
  if (error) return respostaErroChat(error, "mensagens/pedir");
  return NextResponse.json({ conversa: data });
}
