import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAutorizado } from "@/lib/cron/autorizacao";

export const dynamic = "force-dynamic";

// Rotina agendada (Vercel Cron, todo dia de manhã no horário de
// Brasília): gera as notificações do sino — renovação, saldo baixo,
// novidades do site, o incentivo do dia e os retornos agendados para
// hoje. Toda a regra fica nas funções SQL "gerar_notificacoes" (etapa 9)
// e "gerar_notificacoes_retorno" (etapa 10), que não repetem aviso já
// dado; rodar duas vezes no mesmo dia não duplica nada.
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

  // Retornos do dia (etapa 10). Se o script ainda não foi rodado, as
  // outras notificações seguem normalmente.
  const retorno = await admin.rpc("gerar_notificacoes_retorno");
  if (retorno.error) {
    const faltaEtapa10 = ["PGRST202", "42883"].includes(retorno.error.code ?? "");
    console.error(
      faltaEtapa10 ? "[cron/notificacoes] Etapa 10 não encontrada:" : "[cron/notificacoes] retorno:",
      retorno.error.code,
      retorno.error.message,
    );
  }

  const geradas = { ...(data as object), ...(retorno.data as object | null) };
  console.log("[cron/notificacoes] geradas:", JSON.stringify(geradas));
  return NextResponse.json({ geradas });
}
