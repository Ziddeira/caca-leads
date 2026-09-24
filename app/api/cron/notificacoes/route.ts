import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAutorizado } from "@/lib/cron/autorizacao";
import { registrarErro } from "@/lib/erros/registrar";

export const dynamic = "force-dynamic";

// Rotina agendada (Vercel Cron, todo dia de manhã no horário de
// Brasília): gera as notificações do sino — renovação, saldo baixo,
// novidades do site, o incentivo do dia, os retornos agendados para
// hoje e os avisos escritos na Gestão. Toda a regra fica nas
// funções SQL "gerar_notificacoes" (etapa 9), "gerar_notificacoes_retorno"
// (etapa 10) e "entregar_avisos" (etapa 11), que não repetem aviso já
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
    await registrarErro("notificacoes", `gerar_notificacoes falhou: ${error.message}`, { codigo: error.code });
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
    if (!faltaEtapa10) {
      await registrarErro("notificacoes", `gerar_notificacoes_retorno falhou: ${retorno.error.message}`, {
        codigo: retorno.error.code,
      });
    }
  }

  // Avisos escritos pelo administrador (etapa 11): entrega para quem
  // entrou no período (cadastro novo, troca de plano, aviso agendado).
  const avisos = await admin.rpc("entregar_avisos");
  if (avisos.error) {
    const faltaEtapa11 = ["PGRST202", "42883"].includes(avisos.error.code ?? "");
    console.error(
      faltaEtapa11 ? "[cron/notificacoes] Etapa 11 não encontrada:" : "[cron/notificacoes] avisos:",
      avisos.error.code,
      avisos.error.message,
    );
    if (!faltaEtapa11) {
      await registrarErro("notificacoes", `entregar_avisos falhou: ${avisos.error.message}`, { codigo: avisos.error.code });
    }
  }

  const geradas = {
    ...(data as object),
    ...(retorno.data as object | null),
    ...(avisos.error ? {} : { avisos: avisos.data }),
  };
  console.log("[cron/notificacoes] geradas:", JSON.stringify(geradas));
  return NextResponse.json({ geradas });
}
