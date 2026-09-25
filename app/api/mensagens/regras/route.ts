import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/comunidade/servidor";
import { respostaErroChat } from "@/lib/mensagens/servidor";

export const dynamic = "force-dynamic";

// Aceitar as regras das Mensagens (inclui o aviso de que conversas
// denunciadas são lidas pela administração).
export async function POST() {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;
  const { error } = await acesso.supabase.rpc("chat_aceitar_regras");
  if (error) return respostaErroChat(error, "mensagens/regras");
  return NextResponse.json({ ok: true });
}
