import { NextResponse } from "next/server";
import { PLANOS, ehPlanoPago } from "@/lib/planos";
import { alterarValorAssinatura } from "@/lib/pagamentos/asaas";
import { assinaturaViva, erro, mensagemDeErro, prepararContexto } from "@/lib/pagamentos/contexto";
import { faltaEtapa19 } from "@/lib/pagamentos/cupons";

export const dynamic = "force-dynamic";

// Troca de plano: muda o valor da assinatura no Asaas a partir da próxima
// renovação. O plano em uso continua o mesmo até essa renovação ser paga
// (quem aplica a mudança é o webhook).
// Se a assinatura tem desconto de cupom ainda valendo e o cupom também
// vale para o plano novo, o desconto continua; senão, preço cheio. Quem
// decide o valor é o banco (valor_mensalidade).
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

  let valor = plano.preco;
  const mensalidade = await ctx.admin.rpc("valor_mensalidade", {
    p_subscription_id: assinatura.asaas_subscription_id,
    p_plano: plano.id,
  });
  if (mensalidade.error) {
    if (!faltaEtapa19(mensalidade.error.code)) {
      console.error("[plano/trocar] valor_mensalidade:", mensalidade.error.code, mensalidade.error.message);
      return erro("Não foi possível calcular o valor do plano novo. Tente de novo.", 500);
    }
  } else if (mensalidade.data != null) {
    valor = Number(mensalidade.data);
  }

  try {
    await alterarValorAssinatura(
      assinatura.asaas_subscription_id,
      valor,
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

  return NextResponse.json({ ok: true, valor });
}
