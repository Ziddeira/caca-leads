import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detalhesLugar, ErroGooglePlaces } from "@/lib/leads/google";
import { montarDadosLead } from "@/lib/leads/dadosLead";

export const dynamic = "force-dynamic";

function limparMensagemPostgres(msg: string): string {
  return msg.replace(/^ERROR:\s*/i, "");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { erro: "Supabase não configurado neste ambiente." },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "É preciso estar logado." }, { status: 401 });
  }

  let corpo: { placeId?: string };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }

  const placeId = corpo.placeId?.trim();
  if (!placeId) {
    return NextResponse.json({ erro: "place_id é obrigatório." }, { status: 400 });
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json(
      { erro: "GOOGLE_PLACES_API_KEY não configurada no servidor." },
      { status: 500 },
    );
  }

  // Confere e desconta 1 crédito de forma atômica (função "security
  // definer"); se o lead já tinha sido desbloqueado antes, não cobra
  // de novo.
  const { data: resultadoBruto, error } = await supabase.rpc("desbloquear_lead", {
    p_place_id: placeId,
  });

  if (error) {
    return NextResponse.json({ erro: limparMensagemPostgres(error.message) }, { status: 400 });
  }

  const resultado = Array.isArray(resultadoBruto) ? resultadoBruto[0] : resultadoBruto;

  try {
    const lugar = await detalhesLugar(placeId);
    const dados = montarDadosLead(lugar);
    // Guarda os dados em cache (até 30 dias) para "Meus leads" abrir sem
    // chamar o Google de novo. Se o cache falhar, o desbloqueio segue
    // valendo normalmente.
    await Promise.allSettled([
      supabase.from("chamadas_google").insert({ user_id: user.id, tipo: "place_details" }),
      supabase.rpc("salvar_dados_lead", { p_place_id: placeId, p_dados: dados }),
    ]);

    return NextResponse.json({
      jaDesbloqueado: resultado.ja_desbloqueado,
      creditosRestantes: resultado.creditos_restantes,
      contato: {
        telefone: dados.telefone,
        whatsapp: dados.whatsapp,
        site: dados.site,
        maps: dados.maps,
        situacao: dados.situacao,
        plataforma: dados.plataforma,
      },
    });
  } catch (e) {
    // O crédito já foi descontado (ou o lead já estava desbloqueado) —
    // isso é intencional: tentar de novo não cobra outra vez, porque a
    // função SQL é idempotente.
    const msg = e instanceof ErroGooglePlaces ? e.message : "Erro ao buscar dados de contato no Google.";
    return NextResponse.json(
      {
        jaDesbloqueado: resultado.ja_desbloqueado,
        creditosRestantes: resultado.creditos_restantes,
        erro: `O crédito foi descontado, mas não foi possível buscar os dados de contato agora: ${msg} Tente desbloquear de novo — não será cobrado outra vez.`,
      },
      { status: 502 },
    );
  }
}
