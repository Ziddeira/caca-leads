// Regras do score, da verificação e do rank usadas na tela. Quem decide
// de verdade é o banco (supabase/etapa8-*.sql): mantenha estes
// números iguais aos de lá. Aqui é só para mostrar e avisar antes.

export const MSG_FALTA_ETAPA8 =
  "O score e o rank ainda não foram ativados no banco. Rode as 3 partes supabase/etapa8-1, etapa8-2 e etapa8-3 no Supabase, nessa ordem.";

// Função, coluna ou tabela inexistente = script da etapa 8 não rodado.
export function faltaEtapa8(codigo: string | undefined) {
  return ["PGRST202", "PGRST205", "42883", "42703", "42P01"].includes(codigo ?? "");
}

export const PONTOS_FECHADO = 10;
export const PONTOS_VERIFICADA = 40; // somados aos 10 do fechamento
export const TENTATIVAS_PARA_COMPROVANTE = 3;
export const PREMIO_POR_POSICAO = [25, 15, 10] as const;

export const COMPROVANTE_BUCKET = "comprovantes";
export const COMPROVANTE_MAX_BYTES = 5 * 1024 * 1024;
export const COMPROVANTE_TIPOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

// Situações em que a verificação automática ainda roda e o usuário ainda
// pode corrigir o endereço.
export const STATUS_EM_ABERTO = ["pendente_verificacao", "aguardando_google", "nao_verificada"] as const;

export function emAberto(status: string) {
  return (STATUS_EM_ABERTO as readonly string[]).includes(status);
}

export function podeEnviarComprovante(status: string, tentativas: number) {
  return emAberto(status) && tentativas >= TENTATIVAS_PARA_COMPROVANTE;
}

// "2026-09" → 1º de setembro; qualquer outra coisa → null (mês atual).
export function lerMes(texto: string | undefined): string | null {
  if (!texto || !/^\d{4}-(0[1-9]|1[0-2])$/.test(texto)) return null;
  return `${texto}-01`;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// "2026-08-01" → "agosto de 2026".
export function nomeDoMes(aaaammdd: string) {
  const [a, m] = aaaammdd.split("-");
  return `${MESES[Number(m) - 1]} de ${a}`;
}

// Mês atual em Brasília, "AAAA-MM-01".
export function mesAtualBrasilia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 8) + "01";
}
