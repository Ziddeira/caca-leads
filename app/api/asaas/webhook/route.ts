import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarErro } from "@/lib/erros/registrar";

export const dynamic = "force-dynamic";

const NOME_CABECALHO_TOKEN = "asaas-access-token";

// Mostra só as pontas do valor (para os logs), nunca o token inteiro.
function mascarar(valor: string): string {
  if (valor.length <= 8) return `${valor.length} caractere(s)`;
  return `"${valor.slice(0, 4)}…${valor.slice(-4)}" (${valor.length} caracteres)`;
}

function tokenValido(recebidoBruto: string | null): boolean {
  const esperadoBruto = process.env.ASAAS_WEBHOOK_TOKEN;
  const esperado = esperadoBruto?.trim();
  const recebido = recebidoBruto?.trim();

  if (!esperado) {
    console.error(
      `[asaas webhook] ASAAS_WEBHOOK_TOKEN não chegou até a rota (variável ausente ou vazia no ambiente do deploy). ` +
        `Confira se ela está cadastrada para o ambiente "Production" na Vercel e se o deploy atual já é posterior a esse cadastro.`,
    );
    return false;
  }

  if (!recebido) {
    console.error(
      `[asaas webhook] O cabeçalho "${NOME_CABECALHO_TOKEN}" não veio na requisição (ou veio vazio).`,
    );
    return false;
  }

  // Buffer.from(recebido) vs Buffer.from(esperado) direto, sem trim, é
  // frágil: um espaço ou quebra de linha a mais (comum ao colar o valor
  // no painel do Asaas ou no formulário de env vars da Vercel) já muda o
  // tamanho e derruba a comparação sem nenhum aviso — daí o .trim() acima
  // antes de montar os buffers.
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  const bateu = a.length === b.length && timingSafeEqual(a, b);

  if (!bateu) {
    console.error(
      `[asaas webhook] Token não confere.`,
      `variável ASAAS_WEBHOOK_TOKEN no servidor: ${mascarar(esperado)}${
        esperadoBruto !== esperado ? " [tinha espaço/quebra de linha sobrando, já removidos aqui]" : ""
      }`,
      `| cabeçalho "${NOME_CABECALHO_TOKEN}" recebido: ${mascarar(recebido)}${
        recebidoBruto !== recebido ? " [tinha espaço/quebra de linha sobrando, já removidos aqui]" : ""
      }`,
    );
  }

  return bateu;
}

// Webhook do Asaas. Cadastre no painel do Asaas a URL
//   https://<seu-domínio>/api/asaas/webhook
// com o mesmo token que está em ASAAS_WEBHOOK_TOKEN.
//
// Toda a regra (idempotência, renovação, pacote, estorno, cancelamento e
// registro de auditoria) fica na função SQL "processar_evento_asaas",
// que roda numa transação só. Esta rota só confere o token e repassa.
export async function POST(request: Request) {
  const cabecalhoToken = request.headers.get(NOME_CABECALHO_TOKEN);

  if (!cabecalhoToken) {
    // Headers.get() do Next já ignora maiúsculas/minúsculas no NOME do
    // cabeçalho — se caiu aqui, o Asaas não mandou nenhum cabeçalho com
    // esse nome. Loga os nomes recebidos (nunca os valores) para
    // confirmar como o Asaas está realmente enviando.
    console.error(
      `[asaas webhook] Nenhum cabeçalho "${NOME_CABECALHO_TOKEN}" chegou. Cabeçalhos recebidos:`,
      [...request.headers.keys()],
    );
  }

  if (!tokenValido(cabecalhoToken)) {
    return NextResponse.json({ erro: "Token inválido." }, { status: 401 });
  }

  let evento: unknown;
  try {
    evento = await request.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }
  if (!evento || typeof evento !== "object" || typeof (evento as { event?: unknown }).event !== "string") {
    return NextResponse.json({ erro: "Evento sem o campo \"event\"." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ erro: "Servidor sem SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }

  const { data, error } = await admin.rpc("processar_evento_asaas", { p_payload: evento });
  if (error) {
    // Erro 500 faz o Asaas tentar entregar de novo mais tarde — e como o
    // processamento é idempotente, a nova tentativa não duplica crédito.
    console.error("processar_evento_asaas falhou:", error.message);
    const e = evento as { event?: string; id?: string; payment?: { id?: string } };
    await registrarErro("webhook_asaas", `processar_evento_asaas falhou: ${error.message}`, {
      codigo: error.code,
      evento: e.event,
      evento_id: e.id,
      pagamento: e.payment?.id,
    });
    return NextResponse.json({ erro: "Falha ao processar o evento." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, resultado: data });
}
