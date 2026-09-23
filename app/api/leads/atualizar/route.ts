import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detalhesLugar, ErroGooglePlaces } from "@/lib/leads/google";
import { cacheValido, montarDadosLead, type DadosLead } from "@/lib/leads/dadosLead";

export const dynamic = "force-dynamic";

// Preenche o cache de um lead JÁ desbloqueado quando ele ainda não existe
// (leads desbloqueados antes da Etapa 4) ou passou de 30 dias. Não cobra
// crédito e não mexe no desbloqueio: só lê o lead do próprio usuário e
// grava o cache. Se o cache ainda vale, devolve ele sem chamar o Google.
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

  // O RLS só devolve linhas do próprio usuário: se não veio nada, o lead
  // não foi desbloqueado por ele.
  type Linha = { place_id: string; dados?: DadosLead | null; dados_atualizados_em?: string | null };
  let resposta = await supabase
    .from("leads_desbloqueados")
    .select("place_id, dados, dados_atualizados_em")
    .eq("place_id", placeId)
    .maybeSingle<Linha>();

  // Sem o script da etapa 4, as colunas de cache não existem: confere só
  // o desbloqueio e segue buscando no Google (sem conseguir guardar).
  if (resposta.error) {
    resposta = await supabase
      .from("leads_desbloqueados")
      .select("place_id")
      .eq("place_id", placeId)
      .maybeSingle<Linha>();
  }

  if (resposta.error) {
    return NextResponse.json({ erro: "Não foi possível ler o lead agora." }, { status: 500 });
  }
  const linha = resposta.data;
  if (!linha) {
    return NextResponse.json({ erro: "Esse lead não está entre os seus desbloqueados." }, { status: 404 });
  }

  if (linha.dados && cacheValido(linha.dados_atualizados_em)) {
    return NextResponse.json({ dados: linha.dados, atualizadoEm: linha.dados_atualizados_em });
  }

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json(
      { erro: "GOOGLE_PLACES_API_KEY não configurada no servidor." },
      { status: 500 },
    );
  }

  try {
    const dados = montarDadosLead(await detalhesLugar(placeId));
    await Promise.allSettled([
      supabase.from("chamadas_google").insert({ user_id: user.id, tipo: "place_details" }),
      supabase.rpc("salvar_dados_lead", { p_place_id: placeId, p_dados: dados }),
    ]);
    return NextResponse.json({ dados, atualizadoEm: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof ErroGooglePlaces ? e.message : "Erro ao buscar dados no Google.";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }
}
