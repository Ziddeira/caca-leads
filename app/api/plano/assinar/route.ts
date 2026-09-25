import { NextResponse } from "next/server";
import { PLANOS, ehFormaPagamento, ehPlanoPago } from "@/lib/planos";
import {
  cancelarAssinatura,
  criarAssinatura,
  hojeBrasil,
  linkPrimeiraCobranca,
} from "@/lib/pagamentos/asaas";
import {
  assinaturaViva,
  erro,
  garantirClienteAsaas,
  mensagemDeErro,
  prepararContexto,
} from "@/lib/pagamentos/contexto";

export const dynamic = "force-dynamic";

// Cria a assinatura no Asaas e devolve o link da fatura. O plano NÃO muda
// aqui: só quando o webhook do Asaas avisar que o pagamento foi confirmado.
export async function POST(request: Request) {
  const ctx = await prepararContexto();
  if (ctx instanceof NextResponse) return ctx;

  let corpo: { plano?: unknown; forma?: unknown; nome?: unknown; cpfCnpj?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("Corpo da requisição inválido.");
  }

  if (!ehPlanoPago(corpo.plano)) return erro("Escolha o plano Solo ou Pro.");
  if (!ehFormaPagamento(corpo.forma)) return erro("Escolha Pix ou cartão de crédito.");
  const plano = PLANOS[corpo.plano];

  if (await assinaturaViva(ctx)) {
    return erro("Você já tem uma assinatura. Use \"Trocar de plano\" ou cancele a atual antes.");
  }

  try {
    const cliente = await garantirClienteAsaas(ctx, corpo);

    // Quem cancelou mas ainda está dentro do ciclo pago só é cobrado de
    // novo quando esse ciclo acabar (não paga duas vezes pelo mesmo mês).
    const { data: atual } = await ctx.supabase.rpc("meu_plano").single<{
      plano: string;
      plano_valido_ate: string | null;
    }>();
    let vencimento = hojeBrasil();
    if (atual?.plano !== "gratis" && atual?.plano_valido_ate) {
      const fimCiclo = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
        new Date(atual.plano_valido_ate),
      );
      if (fimCiclo > vencimento) vencimento = fimCiclo;
    }

    const assinatura = await criarAssinatura({
      cliente,
      forma: corpo.forma,
      valor: plano.preco,
      primeiroVencimento: vencimento,
      descricao: `Ártemis Prospect — plano ${plano.nome} (mensal)`,
      referencia: `assinatura:${ctx.user.id}`,
    });
    const link = await linkPrimeiraCobranca(assinatura.id).catch(() => null);

    const { error } = await ctx.admin.rpc("registrar_assinatura", {
      p_user_id: ctx.user.id,
      p_subscription_id: assinatura.id,
      p_plano: plano.id,
      p_forma: corpo.forma,
      p_link: link,
    });
    if (error) {
      // Não deixa uma assinatura "órfã" cobrando no Asaas.
      await cancelarAssinatura(assinatura.id).catch(() => {});
      return erro("Não foi possível registrar a assinatura. Nada foi cobrado; tente de novo.", 500);
    }

    return NextResponse.json({ link, vencimento });
  } catch (e) {
    return erro(mensagemDeErro(e), 502);
  }
}
