import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respostaErroRetorno } from "@/lib/leads/errosFunil";
import { OBS_RETORNO_MAX } from "@/lib/leads/retorno";

export const dynamic = "force-dynamic";

// Marca, troca ou apaga o retorno de um lead do usuário logado.
// Corpo: { placeId, data: "AAAA-MM-DD", hora: "HH:MM", observacao? }
// ou { placeId, remover: true }.
// Quem grava de verdade é a função SQL "agendar_retorno_lead": ela
// confere que o lead é de quem está logado e que a data ainda não passou.
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

  if (corpo.remover === true) {
    const { error } = await supabase.rpc("agendar_retorno_lead", {
      p_place_id: placeId,
      p_data: null,
      p_hora: null,
      p_observacao: null,
    });
    if (error) return respostaErroRetorno(error);
    return NextResponse.json({ retorno: null });
  }

  const data = typeof corpo.data === "string" ? corpo.data : "";
  const hora = typeof corpo.hora === "string" ? corpo.hora : "";
  const observacao = typeof corpo.observacao === "string" ? corpo.observacao.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ erro: "Informe o dia do retorno." }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(hora)) {
    return NextResponse.json({ erro: "Informe o horário do retorno." }, { status: 400 });
  }
  if (observacao.length > OBS_RETORNO_MAX) {
    return NextResponse.json(
      { erro: `A observação pode ter no máximo ${OBS_RETORNO_MAX} caracteres.` },
      { status: 400 },
    );
  }

  const { data: em, error } = await supabase.rpc("agendar_retorno_lead", {
    p_place_id: placeId,
    p_data: data,
    p_hora: hora,
    p_observacao: observacao,
  });
  if (error) return respostaErroRetorno(error);
  return NextResponse.json({ retorno: { em: em as string, obs: observacao || null } });
}
