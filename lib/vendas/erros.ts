import { NextResponse } from "next/server";
import { MSG_FALTA_ETAPA8, faltaEtapa8 } from "./regras";

// Traduz o erro das funções SQL da etapa 8 numa resposta para a tela.
// As regras (dono da venda, situação, tentativas, administrador) são
// conferidas no banco; as mensagens delas (P0001) vão direto para a tela.
export function respostaErroVenda(error: { code?: string; message: string }, contexto: string) {
  if (faltaEtapa8(error.code)) {
    console.error(`[${contexto}] Etapa 8 não encontrada:`, error.code, error.message);
    return NextResponse.json({ erro: `${MSG_FALTA_ETAPA8} (código: ${error.code})` }, { status: 503 });
  }
  if (error.code === "P0001" || error.code === "23514") {
    return NextResponse.json({ erro: error.message }, { status: 400 });
  }
  if (error.code === "23505") {
    return NextResponse.json({ erro: "Esta empresa já tem uma venda verificada por outra conta." }, { status: 409 });
  }
  console.error(`[${contexto}]`, error.code, error.message);
  return NextResponse.json({ erro: "Não foi possível salvar agora. Tente de novo em instantes." }, { status: 500 });
}
