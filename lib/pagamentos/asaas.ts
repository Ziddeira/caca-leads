import "server-only";

// Cliente mínimo da API v3 do Asaas. A chave (ASAAS_API_KEY) só é lida
// aqui, no servidor — nunca vai para o navegador.
// ASAAS_ENV: "sandbox" (padrão) ou "producao".

export class ErroAsaas extends Error {}

function baseUrl() {
  const env = (process.env.ASAAS_ENV || "sandbox").toLowerCase();
  return env === "producao" || env === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

export function asaasConfigurado() {
  return !!process.env.ASAAS_API_KEY;
}

async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const chave = process.env.ASAAS_API_KEY;
  if (!chave) throw new ErroAsaas("ASAAS_API_KEY não configurada no servidor.");

  const res = await fetch(`${baseUrl()}${caminho}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "caca-leads",
      access_token: chave,
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    cache: "no-store",
  });

  const dados = await res.json().catch(() => null);
  if (!res.ok) {
    const descricao = dados?.errors?.map((e: { description?: string }) => e.description).join(" ");
    throw new ErroAsaas(descricao || `O Asaas respondeu com erro ${res.status}.`);
  }
  return dados as T;
}

// Data de hoje no horário de Brasília, no formato AAAA-MM-DD.
export function hojeBrasil(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function criarCliente(dados: {
  nome: string;
  cpfCnpj: string;
  email: string | null;
  userId: string;
}) {
  return chamar<{ id: string }>("POST", "/customers", {
    name: dados.nome,
    cpfCnpj: dados.cpfCnpj,
    email: dados.email ?? undefined,
    externalReference: dados.userId,
  });
}

export function criarAssinatura(dados: {
  cliente: string;
  forma: "PIX" | "CREDIT_CARD";
  valor: number;
  primeiroVencimento: string;
  descricao: string;
  referencia: string;
}) {
  return chamar<{ id: string }>("POST", "/subscriptions", {
    customer: dados.cliente,
    billingType: dados.forma,
    value: dados.valor,
    nextDueDate: dados.primeiroVencimento,
    cycle: "MONTHLY",
    description: dados.descricao,
    externalReference: dados.referencia,
  });
}

export async function linkPrimeiraCobranca(assinaturaId: string): Promise<string | null> {
  const res = await chamar<{ data: { invoiceUrl?: string }[] }>(
    "GET",
    `/subscriptions/${encodeURIComponent(assinaturaId)}/payments`,
  );
  return res.data?.[0]?.invoiceUrl ?? null;
}

export function alterarValorAssinatura(assinaturaId: string, valor: number, descricao: string) {
  return chamar("POST", `/subscriptions/${encodeURIComponent(assinaturaId)}`, {
    value: valor,
    description: descricao,
    // Atualiza também a cobrança da próxima renovação, se já tiver sido gerada.
    updatePendingPayments: true,
  });
}

export function cancelarAssinatura(assinaturaId: string) {
  return chamar("DELETE", `/subscriptions/${encodeURIComponent(assinaturaId)}`);
}

export function criarCobranca(dados: {
  cliente: string;
  forma: "PIX" | "CREDIT_CARD";
  valor: number;
  vencimento: string;
  descricao: string;
  referencia: string;
}) {
  return chamar<{ id: string; invoiceUrl: string }>("POST", "/payments", {
    customer: dados.cliente,
    billingType: dados.forma,
    value: dados.valor,
    dueDate: dados.vencimento,
    description: dados.descricao,
    externalReference: dados.referencia,
  });
}
