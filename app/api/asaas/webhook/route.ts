import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function tokenValido(recebido: string | null): boolean {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Webhook do Asaas. Cadastre no painel do Asaas a URL
//   https://<seu-domínio>/api/asaas/webhook
// com o mesmo token que está em ASAAS_WEBHOOK_TOKEN.
//
// Toda a regra (idempotência, renovação, pacote, estorno, cancelamento e
// registro de auditoria) fica na função SQL "processar_evento_asaas",
// que roda numa transação só. Esta rota só confere o token e repassa.
export async function POST(request: Request) {
  if (!tokenValido(request.headers.get("asaas-access-token"))) {
    return NextResponse.json({ erro: "Token inválido." }, { status: 401 });
  }

  let evento: unknown;
  try {
    evento = await request.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }
  if (!evento || typeof evento !== "object" || typeof (evento as { event?: unknown }).event !== "string") {
    return NextResponse.json({ erro: "Evento sem o campo \"event\"." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ erro: "Servidor sem SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { data, error } = await admin.rpc("processar_evento_asaas", { p_payload: evento });
  if (error) {
    // Erro 500 faz o Asaas tentar entregar de novo mais tarde — e como o
    // processamento é idempotente, a nova tentativa não duplica crédito.
    console.error("processar_evento_asaas falhou:", error.message);
    return NextResponse.json({ erro: "Falha ao processar o evento." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, resultado: data });
}
