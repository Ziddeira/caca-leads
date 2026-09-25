import { NextResponse } from "next/server";
import { PLANOS, ehPlanoPago } from "@/lib/planos";
import { alterarValorAssinatura } from "@/lib/pagamentos/asaas";
import { assinaturaViva, erro, mensagemDeErro, prepararContexto } from "@/lib/pagamentos/contexto";

export const dynamic = "force-dynamic";

// Troca de plano: muda o valor da assinatura no Asaas a partir da próxima
// renovação. O plano em uso continua o mesmo até essa renovação ser paga
// (quem aplica a mudança é o webhook).
export async function POST(request: Request) {
  const ctx = await prepararContexto();
  if (ctx instanceof NextResponse) return ctx;

  let corpo: { plano?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("Corpo da requisição inválido.");
  }
  if (!ehPlanoPago(corpo.plano)) return erro("Escolha o plano Solo ou Pro.");
  const plano = PLANOS[corpo.plano];

  const assinatura = await assinaturaViva(ctx);
  if (!assinatura) return erro("Você não tem uma assinatura ativa para trocar.");
  if (assinatura.plano === plano.id) return erro(`Sua assinatura já é do plano ${plano.nome}.`);

  try {
    await alterarValorAssinatura(
      assinatura.asaas_subscription_id,
      plano.preco,
      `Ártemis Prospect — plano ${plano.nome} (mensal)`,
    );
  } catch (e) {
    return erro(mensagemDeErro(e), 502);
  }

  const { error } = await ctx.admin.rpc("agendar_troca_plano", {
    p_user_id: ctx.user.id,
    p_subscription_id: assinatura.asaas_subscription_id,
    p_plano: plano.id,
  });
  if (error) return erro("A troca foi feita no Asaas, mas não foi registrada aqui. Tente de novo.", 500);

  return NextResponse.json({ ok: true });
}
