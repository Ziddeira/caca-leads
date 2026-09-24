import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAutorizado } from "@/lib/cron/autorizacao";

export const dynamic = "force-dynamic";

// Rotina agendada (Vercel Cron, dia 1º de cada mês logo depois da
// meia-noite de Brasília): fecha o rank do mês que acabou, guarda no
// histórico e credita o prêmio do top 3. A função SQL é idempotente —
// rodar de novo não paga duas vezes — e também fecha meses que tenham
// ficado para trás se alguma rodada falhou.
export async function GET(request: Request) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ erro: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 500 });
  }

  const { data, error } = await admin.rpc("fechar_meses_pendentes");
  if (error) {
    console.error("[cron/fechar-mes]", error.code, error.message);
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  console.log(`[cron/fechar-mes] meses fechados: ${data}`);
  return NextResponse.json({ mesesFechados: data });
}
