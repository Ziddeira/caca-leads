import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAutorizado } from "@/lib/cron/autorizacao";

export const dynamic = "force-dynamic";

// Rotina agendada (Vercel Cron, todo dia de manhã no horário de
// Brasília): gera as notificações do sino — renovação, saldo baixo,
// novidades do site e o incentivo do dia. Toda a regra fica na função
// SQL "gerar_notificacoes", que não repete aviso já dado; rodar duas
// vezes no mesmo dia não duplica nada.
export async function GET(request: Request) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ erro: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 500 });
  }

  const { data, error } = await admin.rpc("gerar_notificacoes");
  if (error) {
    console.error("[cron/notificacoes]", error.code, error.message);
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  console.log("[cron/notificacoes] geradas:", JSON.stringify(data));
  return NextResponse.json({ geradas: data });
}
