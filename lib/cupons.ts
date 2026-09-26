import { PLANOS, type PlanoPago } from "@/lib/planos";

// Cupons de desconto (etapa 19). O preço que vale é SEMPRE o calculado
// no banco (função SQL "preco_com_cupom"); este arquivo repete a conta
// só para mostrar na tela antes de salvar. Se mudar um, mude o outro.

export type TipoDesconto = "percentual" | "fixo";
// 1 = só o primeiro mês; 3 = os 3 primeiros meses; null = enquanto durar.
export type DuracaoDesconto = 1 | 3 | null;

// Mínimo que o Asaas aceita numa cobrança.
export const PISO_ASAAS = 5;

export const CODIGO_CUPOM = /^[A-Z0-9_-]{3,30}$/;

export function normalizarCodigo(valor: string) {
  return valor.trim().toUpperCase();
}

// Mesma conta de preco_com_cupom, em centavos para não errar no
// arredondamento.
export function precoComCupom(preco: number, tipo: TipoDesconto, valor: number): number {
  const centavos = Math.round(preco * 100);
  const final =
    tipo === "percentual"
      ? Math.round((centavos * (100 - valor)) / 100)
      : centavos - Math.round(valor * 100);
  return final / 100;
}

export function precoFinalPlano(plano: PlanoPago, tipo: TipoDesconto, valor: number) {
  return precoComCupom(PLANOS[plano].preco, tipo, valor);
}

export function textoDuracao(duracao: number | null) {
  if (duracao === 1) return "só no primeiro mês";
  if (duracao === 3) return "nos 3 primeiros meses";
  return "enquanto a assinatura durar";
}

export function textoDesconto(tipo: TipoDesconto, valor: number) {
  return tipo === "percentual"
    ? `${valor.toLocaleString("pt-BR")}% de desconto`
    : `${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de desconto`;
}
