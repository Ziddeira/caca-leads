import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ANOTACAO_MAX, situacaoFunilValida } from "@/lib/leads/funil";
import { respostaErroFunil } from "@/lib/leads/errosFunil";

export const dynamic = "force-dynamic";

// Muda a situação OU a anotação de um lead do usuário logado.
// Quem grava de verdade são as funções SQL "atualizar_situacao_lead" e
// "salvar_anotacao_lead": elas conferem que o lead é de quem está logado
// e não deixam marcar "fechado" por aqui (isso é só pela venda).
export async function PATCH(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ erro: "Supabase não configurado neste ambiente." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "É preciso estar logado." }, { status: 401 });
  }

  const corpo = await request.json().catch(() => null);
  const placeId = typeof corpo?.placeId === "string" ? corpo.placeId.trim() : "";
  if (!placeId) {
    return NextResponse.json({ erro: "place_id é obrigatório." }, { status: 400 });
  }

  if (corpo && "situacao" in corpo) {
    if (!situacaoFunilValida(corpo.situacao)) {
      return NextResponse.json({ erro: "Situação inválida." }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("atualizar_situacao_lead", {
      p_place_id: placeId,
      p_situacao: corpo.situacao,
    });
    if (error) return respostaErroFunil(error, "funil");
    return NextResponse.json({ ultimoContatoEm: data as string | null });
  }

  if (corpo && "anotacao" in corpo) {
    const anotacao = typeof corpo.anotacao === "string" ? corpo.anotacao.trim() : "";
    if (anotacao.length > ANOTACAO_MAX) {
      return NextResponse.json({ erro: `A anotação pode ter no máximo ${ANOTACAO_MAX} caracteres.` }, { status: 400 });
    }
    const { error } = await supabase.rpc("salvar_anotacao_lead", { p_place_id: placeId, p_anotacao: anotacao });
    if (error) return respostaErroFunil(error, "anotacao");
    return NextResponse.json({ anotacao: anotacao || null });
  }

  return NextResponse.json({ erro: "Nada para salvar." }, { status: 400 });
}
