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
import { faltaEtapa19 } from "@/lib/pagamentos/cupons";
import { textoDuracao } from "@/lib/cupons";

export const dynamic = "force-dynamic";

// Cria a assinatura no Asaas e devolve o link da fatura. O plano NÃO muda
// aqui: só quando o webhook do Asaas avisar que o pagamento foi confirmado.
//
// Cupom: o navegador manda só o CÓDIGO. O preço com desconto é calculado
// pelo banco (conferir_cupom) e é esse valor que vai para o Asaas; depois
// o banco confere tudo de novo, com o cupom travado, ao registrar
// (registrar_assinatura_com_cupom). Se algo mudou no meio do caminho, a
// assinatura é cancelada no Asaas e nada é cobrado.
export async function POST(request: Request) {
  const ctx = await prepararContexto();
  if (ctx instanceof NextResponse) return ctx;

  let corpo: { plano?: unknown; forma?: unknown; nome?: unknown; cpfCnpj?: unknown; cupom?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("Corpo da requisição inválido.");
  }

  if (!ehPlanoPago(corpo.plano)) return erro("Escolha o plano Solo ou Pro.");
  if (!ehFormaPagamento(corpo.forma)) return erro("Escolha Pix ou cartão de crédito.");
  const plano = PLANOS[corpo.plano];
  const codigoCupom = typeof corpo.cupom === "string" ? corpo.cupom.trim().slice(0, 40) : "";

  if (await assinaturaViva(ctx)) {
    return erro("Você já tem uma assinatura. Use \"Trocar de plano\" ou cancele a atual antes.");
  }

  let valor = plano.preco;
  let descricao = `Ártemis Prospect — plano ${plano.nome} (mensal)`;
  if (codigoCupom) {
    const { data: cupom, error } = await ctx.supabase
      .rpc("conferir_cupom", { p_codigo: codigoCupom, p_plano: plano.id })
      .single<{ codigo: string; valor_final: number; duracao_meses: number | null }>();
    if (error) {
      if (error.code === "P0001") return erro(error.message);
      if (faltaEtapa19(error.code)) return erro("Cupons ainda não estão disponíveis.", 503);
      console.error("[plano/assinar] conferir_cupom:", error.code, error.message);
      return erro("Não foi possível conferir o cupom agora. Tente de novo.", 500);
    }
    valor = Number(cupom.valor_final);
    descricao = `${descricao} — cupom ${cupom.codigo}, desconto ${textoDuracao(cupom.duracao_meses)}`;
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
      valor,
      primeiroVencimento: vencimento,
      descricao,
      referencia: `assinatura:${ctx.user.id}`,
    });
    const link = await linkPrimeiraCobranca(assinatura.id).catch(() => null);

    const dados = {
      p_user_id: ctx.user.id,
      p_subscription_id: assinatura.id,
      p_plano: plano.id,
      p_forma: corpo.forma,
      p_link: link,
    };
    const { error } = codigoCupom
      ? await ctx.admin.rpc("registrar_assinatura_com_cupom", { ...dados, p_codigo: codigoCupom, p_valor: valor })
      : await ctx.admin.rpc("registrar_assinatura", dados);
    if (error) {
      // Não deixa uma assinatura "órfã" cobrando no Asaas.
      await cancelarAssinatura(assinatura.id).catch(() => {});
      if (codigoCupom && error.code === "P0001") {
        return erro(`${error.message} Nada foi cobrado.`);
      }
      return erro("Não foi possível registrar a assinatura. Nada foi cobrado; tente de novo.", 500);
    }

    return NextResponse.json({ link, vencimento, valor });
  } catch (e) {
    return erro(mensagemDeErro(e), 502);
  }
}
