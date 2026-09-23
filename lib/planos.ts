// Preços e limites dos planos. Os mesmos números estão nas funções SQL
// "limites_do_plano" e "plano_por_valor" (supabase/etapa3-planos-pagamentos.sql)
// — é o banco que aplica os limites; aqui é só para mostrar na tela e
// para mandar o valor certo ao Asaas. Se mudar um, mude o outro.

export type PlanoId = "gratis" | "solo" | "pro";
export type PlanoPago = Exclude<PlanoId, "gratis">;
export type FormaPagamento = "PIX" | "CREDIT_CARD";

export interface Plano {
  id: PlanoId;
  nome: string;
  preco: number;
  desbloqueios: number;
  buscas: number;
  hospedagem: boolean;
}

export const PLANOS: Record<PlanoId, Plano> = {
  gratis: { id: "gratis", nome: "Grátis", preco: 0, desbloqueios: 5, buscas: 3, hospedagem: false },
  solo: { id: "solo", nome: "Solo", preco: 34.9, desbloqueios: 50, buscas: 20, hospedagem: false },
  pro: { id: "pro", nome: "Pro", preco: 69.9, desbloqueios: 100, buscas: 45, hospedagem: true },
};

export const PACOTE_EXTRA = { preco: 24.9, desbloqueios: 25, buscas: 15 };

export function ehPlanoPago(valor: unknown): valor is PlanoPago {
  return valor === "solo" || valor === "pro";
}

export function ehFormaPagamento(valor: unknown): valor is FormaPagamento {
  return valor === "PIX" || valor === "CREDIT_CARD";
}

export function formatarPreco(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
