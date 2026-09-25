import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/comunidade/servidor";
import { respostaErroChat } from "@/lib/mensagens/servidor";
import { BUSCA_MAX } from "@/lib/mensagens/regras";

export const dynamic = "force-dynamic";

// Quem o usuário bloqueou.
export async function GET() {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;
  const { data, error } = await acesso.supabase.rpc("chat_bloqueados");
  if (error) return respostaErroChat(error, "mensagens/bloqueados");
  return NextResponse.json({ bloqueados: data ?? [] });
}

// { apelido, bloquear: true | false }. Bloquear encerra a conversa com a
// pessoa, tira da lista e impede pedidos dos dois lados. Desbloquear não
// reabre a conversa.
export async function POST(request: Request) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;
  const corpo = await request.json().catch(() => null);
  const apelido = typeof corpo?.apelido === "string" ? corpo.apelido.trim().slice(0, BUSCA_MAX) : "";
  if (!apelido || typeof corpo?.bloquear !== "boolean") {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  const { error } = await acesso.supabase.rpc("chat_bloquear", { p_apelido: apelido, p_bloquear: corpo.bloquear });
  if (error) return respostaErroChat(error, "mensagens/bloquear");
  return NextResponse.json({ ok: true });
}
