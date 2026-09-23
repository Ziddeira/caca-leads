import { NextResponse } from "next/server";
import { cancelarAssinatura } from "@/lib/pagamentos/asaas";
import { assinaturaViva, erro, mensagemDeErro, prepararContexto } from "@/lib/pagamentos/contexto";

export const dynamic = "force-dynamic";

// Cancela a assinatura no Asaas (para de cobrar). O plano pago continua
// valendo até o fim do ciclo já pago; depois a conta volta ao Grátis.
export async function POST() {
  const ctx = await prepararContexto();
  if (ctx instanceof NextResponse) return ctx;

  const assinatura = await assinaturaViva(ctx);
  if (!assinatura) return erro("Você não tem uma assinatura para cancelar.");

  try {
    await cancelarAssinatura(assinatura.asaas_subscription_id);
  } catch (e) {
    return erro(mensagemDeErro(e), 502);
  }

  // O webhook SUBSCRIPTION_DELETED também marca isso; aqui é só para a
  // tela já mostrar certo. Não mexe em plano nem créditos.
  await ctx.admin.rpc("marcar_assinatura_cancelada", {
    p_subscription_id: assinatura.asaas_subscription_id,
  });

  return NextResponse.json({ ok: true });
}
