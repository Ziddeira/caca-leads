import { NextResponse } from "next/server";
import { MSG_FALTA_ETAPA7 } from "./funil";

// Traduz o erro das funções SQL da etapa 7 numa resposta para a tela.
// As regras (lead é do usuário, venda única, datas, tamanho da anotação)
// são conferidas no banco; as mensagens delas (P0001) vão direto para a
// pessoa.
export function respostaErroFunil(error: { code?: string; message: string }, contexto: string) {
  // Função ou coluna inexistente: o script da etapa 7 não foi rodado.
  if (["PGRST202", "42883", "42703", "42P01"].includes(error.code ?? "")) {
    console.error(`[${contexto}] Etapa 7 não encontrada:`, error.code, error.message);
    return NextResponse.json({ erro: `${MSG_FALTA_ETAPA7} (código: ${error.code})` }, { status: 503 });
  }
  if (error.code === "23505") {
    return NextResponse.json({ erro: "Você já registrou uma venda para este lead." }, { status: 409 });
  }
  // Data que não existe (ex.: 31/02).
  if (error.code === "22008" || error.code === "22007") {
    return NextResponse.json({ erro: "Data do fechamento inválida." }, { status: 400 });
  }
  if (error.code === "P0001" || error.code === "23514") {
    return NextResponse.json({ erro: error.message }, { status: 400 });
  }
  console.error(`[${contexto}]`, error.code, error.message);
  return NextResponse.json({ erro: "Não foi possível salvar agora. Tente de novo em instantes." }, { status: 500 });
}
