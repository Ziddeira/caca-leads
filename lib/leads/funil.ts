// Funil de cada lead desbloqueado (coluna leads_desbloqueados.situacao) e
// venda fechada (tabela vendas). Ver supabase/etapa7-funil-vendas.sql.

export const MSG_FALTA_ETAPA7 =
  "O funil de leads ainda não foi ativado no banco. Rode o script supabase/etapa7-funil-vendas.sql no Supabase.";

// Erro ao ler o funil que NÃO é "coluna faltando" (o script pode ter
// rodado, mas o Supabase ainda não enxerga as mudanças, ou é permissão).
export const MSG_ERRO_FUNIL =
  "Não foi possível carregar o funil agora. Se você acabou de rodar o script da etapa 7, rode também no SQL Editor: notify pgrst, 'reload schema';";

export const SITUACOES_FUNIL = ["desbloqueado", "contatado", "negociacao", "fechado", "perdido"] as const;

export type SituacaoFunil = (typeof SITUACOES_FUNIL)[number];

export const ROTULO_FUNIL: Record<SituacaoFunil, string> = {
  desbloqueado: "Desbloqueado",
  contatado: "Contatado",
  negociacao: "Em negociação",
  fechado: "Fechado",
  perdido: "Perdido",
};

// Para a contagem do filtro: "12 desbloqueados", "1 em negociação"...
export function contagemFunil(situacao: SituacaoFunil, n: number) {
  const plural = n !== 1;
  switch (situacao) {
    case "desbloqueado":
      return `${n} ${plural ? "desbloqueados" : "desbloqueado"}`;
    case "contatado":
      return `${n} ${plural ? "contatados" : "contatado"}`;
    case "negociacao":
      return `${n} em negociação`;
    case "fechado":
      return `${n} ${plural ? "fechados" : "fechado"}`;
    case "perdido":
      return `${n} ${plural ? "perdidos" : "perdido"}`;
  }
}

export const ESTILO_FUNIL: Record<SituacaoFunil, string> = {
  desbloqueado: "bg-proprio-soft text-proprio border-proprio/25",
  contatado: "bg-rede-soft text-rede border-rede/25",
  negociacao: "bg-hot-soft text-hot-ink border-hot/30",
  fechado: "bg-wa-soft text-wa border-wa/30",
  perdido: "bg-danger-soft text-danger border-danger/25",
};

export function situacaoFunilValida(valor: unknown): valor is SituacaoFunil {
  return typeof valor === "string" && (SITUACOES_FUNIL as readonly string[]).includes(valor);
}

export const ANOTACAO_MAX = 500;

// Situações da venda. Ver supabase/etapa8-score-rank.sql.
export type StatusVenda =
  | "pendente_verificacao"
  | "aguardando_google"
  | "nao_verificada"
  | "em_analise"
  | "verificada"
  | "recusada";

export const ROTULO_STATUS_VENDA: Record<StatusVenda, string> = {
  pendente_verificacao: "Pendente de verificação",
  aguardando_google: "Aguardando o Google",
  nao_verificada: "Não verificada",
  em_analise: "Comprovante em análise",
  verificada: "Verificada",
  recusada: "Recusada",
};

// Cor do texto da situação.
export const COR_STATUS_VENDA: Record<StatusVenda, string> = {
  pendente_verificacao: "text-hot-ink",
  aguardando_google: "text-hot-ink",
  nao_verificada: "text-danger",
  em_analise: "text-rede",
  verificada: "text-wa",
  recusada: "text-danger",
};

// Etiqueta (fundo + texto + borda) da situação.
export const ESTILO_STATUS_VENDA: Record<StatusVenda, string> = {
  pendente_verificacao: "bg-hot-soft text-hot-ink border-hot/30",
  aguardando_google: "bg-hot-soft text-hot-ink border-hot/30",
  nao_verificada: "bg-danger-soft text-danger border-danger/25",
  em_analise: "bg-rede-soft text-rede border-rede/25",
  verificada: "bg-wa-soft text-wa border-wa/30",
  recusada: "bg-danger-soft text-danger border-danger/25",
};

export function statusVendaValido(valor: unknown): valor is StatusVenda {
  return typeof valor === "string" && valor in ROTULO_STATUS_VENDA;
}

// O valor recebido NÃO vem para a tela: fica só no banco, visível apenas
// para o próprio usuário, e nunca é exibido publicamente.
export interface VendaResumo {
  siteUrl: string;
  fechadoEm: string; // AAAA-MM-DD
  status: StatusVenda;
}

// Hoje no horário de Brasília, no formato do <input type="date">.
export function hojeBrasilia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// "exemplo.com.br" vira "https://exemplo.com.br". A validação final é do
// banco (função registrar_venda); esta é só para avisar antes de enviar.
export function normalizarSite(texto: string) {
  const t = texto.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function siteValido(url: string) {
  return url.length <= 500 && /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url);
}

// Aceita "1500", "1.500,50", "1500,5" ou "1500.50". Vazio = sem valor.
export function lerValor(texto: string): number | null | "invalido" {
  const t = texto.trim().replace(/^R\$\s*/i, "");
  if (!t) return null;
  // Com vírgula, ou só com pontos de milhar ("1.500"), o ponto é milhar.
  const normal = t.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return "invalido";
  const n = Number(normal);
  return n > 10_000_000 ? "invalido" : n;
}
