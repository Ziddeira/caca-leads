// Regras do suporte ("Preciso de ajuda") usadas na tela. Quem decide de
// verdade é o banco (supabase/etapa12-suporte.sql): mantenha estes
// números iguais aos de lá.

export const LIMITE_CHAMADOS_ABERTOS = 5;
export const DESCRICAO_MAX = 1000;
export const RESPOSTA_MAX = 2000;

export const SUPORTE_BUCKET = "suporte";
export const ANEXO_MAX_BYTES = 5 * 1024 * 1024;
export const ANEXO_TIPOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const ASSUNTOS = {
  problema_tecnico: "Problema técnico",
  planos_cobranca: "Dúvida sobre planos e cobrança",
  sugestao: "Sugestão",
  outro: "Outro",
} as const;
export type Assunto = keyof typeof ASSUNTOS;

export const SITUACOES = {
  aberto: "Aberto",
  respondido: "Respondido",
  resolvido: "Resolvido",
} as const;
export type Situacao = keyof typeof SITUACOES;

export const COR_SITUACAO: Record<Situacao, string> = {
  aberto: "border-primary bg-primary text-primary-ink",
  respondido: "border-destaque text-destaque",
  resolvido: "border-ink text-ink",
};

export function ehAssunto(v: unknown): v is Assunto {
  return typeof v === "string" && v in ASSUNTOS;
}

export function ehSituacao(v: unknown): v is Situacao {
  return typeof v === "string" && v in SITUACOES;
}

export const MSG_FALTA_ETAPA12 =
  "O suporte ainda não foi ativado no banco. Rode o script supabase/etapa12-suporte.sql no Supabase.";

// Função, coluna ou tabela inexistente = script da etapa 12 não rodado.
export function faltaEtapa12(codigo: string | undefined) {
  return ["PGRST202", "PGRST205", "42883", "42703", "42P01"].includes(codigo ?? "");
}
