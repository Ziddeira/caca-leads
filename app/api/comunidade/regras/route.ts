import { NextResponse } from "next/server";
import { exigirUsuario, respostaErro } from "@/lib/comunidade/servidor";

export const dynamic = "force-dynamic";

// Registra o aceite das regras da comunidade (quem e quando, por versão).
export async function POST() {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;

  const { error } = await acesso.supabase.rpc("comunidade_aceitar_regras");
  if (error) return respostaErro(error, "comunidade/regras");
  return NextResponse.json({ ok: true });
}
