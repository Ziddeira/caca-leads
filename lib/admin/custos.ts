// Preço estimado de cada chamada à Places API (New) do Google, em
// dólares. Os campos pedidos (telefone, site, nota, horário) caem na
// faixa "Enterprise" da tabela do Google. Confira a tabela atual em
// https://developers.google.com/maps/billing-and-pricing/pricing e ajuste
// aqui se mudar. A conta não desconta a franquia gratuita mensal.
export const PRECO_USD_POR_CHAMADA: Record<string, number> = {
  places_text_search: 35 / 1000,
  place_details: 20 / 1000,
  verificacao_venda: 20 / 1000,
};

export const NOME_TIPO_CHAMADA: Record<string, string> = {
  places_text_search: "Busca de texto",
  place_details: "Detalhes do lugar",
  verificacao_venda: "Verificação de venda",
};

export function custoUsd(porTipo: Record<string, number>) {
  return Object.entries(porTipo).reduce((soma, [tipo, qtd]) => soma + qtd * (PRECO_USD_POR_CHAMADA[tipo] ?? 0), 0);
}

export function formatarUsd(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "USD" });
}
