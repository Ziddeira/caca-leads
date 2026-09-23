import { NextResponse } from "next/server";
import { PACOTE_EXTRA, ehFormaPagamento } from "@/lib/planos";
import { criarCobranca, hojeBrasil } from "@/lib/pagamentos/asaas";
import { erro, garantirClienteAsaas, mensagemDeErro, prepararContexto } from "@/lib/pagamentos/contexto";

export const dynamic = "force-dynamic";

// Compra avulsa do pacote extra. Os créditos só entram quando o webhook
// do Asaas confirmar o pagamento.
export async function POST(request: Request) {
  const ctx = await prepararContexto();
  if (ctx instanceof NextResponse) return ctx;

  let corpo: { forma?: unknown; nome?: unknown; cpfCnpj?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("Corpo da requisição inválido.");
  }
  if (!ehFormaPagamento(corpo.forma)) return erro("Escolha Pix ou cartão de crédito.");

  try {
    const cliente = await garantirClienteAsaas(ctx, corpo);
    const cobranca = await criarCobranca({
      cliente,
      forma: corpo.forma,
      valor: PACOTE_EXTRA.preco,
      vencimento: hojeBrasil(),
      descricao: `Caça-leads — pacote extra (+${PACOTE_EXTRA.desbloqueios} desbloqueios e +${PACOTE_EXTRA.buscas} buscas)`,
      referencia: `pacote:${ctx.user.id}`,
    });

    const { error } = await ctx.admin.rpc("registrar_cobranca_pacote", {
      p_user_id: ctx.user.id,
      p_payment_id: cobranca.id,
      p_valor: PACOTE_EXTRA.preco,
      p_forma: corpo.forma,
      p_link: cobranca.invoiceUrl,
    });
    // Mesmo se este registro falhar, o webhook ainda reconhece o pacote
    // pela referência "pacote:<id do usuário>" — então o link segue válido.
    if (error) console.error("registrar_cobranca_pacote falhou:", error.message);

    return NextResponse.json({ link: cobranca.invoiceUrl });
  } catch (e) {
    return erro(mensagemDeErro(e), 502);
  }
}
