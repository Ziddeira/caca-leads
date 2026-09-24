import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lerValor, normalizarSite, siteValido } from "@/lib/leads/funil";
import { respostaErroFunil } from "@/lib/leads/errosFunil";

export const dynamic = "force-dynamic";

// Registra a venda de um lead (marca como fechado). A venda nasce
// "pendente de verificação". Quem grava é a função SQL "registrar_venda",
// que confere que o lead foi desbloqueado por quem está logado, que ainda
// não tem venda e que a data faz sentido. Ela não aceita nenhum campo de
// verificação nem de pontos.
export async function POST(request: Request) {
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
  const site = normalizarSite(typeof corpo?.site === "string" ? corpo.site : "");
  const fechadoEm = typeof corpo?.fechadoEm === "string" ? corpo.fechadoEm : "";
  const valor = lerValor(typeof corpo?.valor === "string" ? corpo.valor : "");

  if (!placeId) {
    return NextResponse.json({ erro: "place_id é obrigatório." }, { status: 400 });
  }
  if (!site) {
    return NextResponse.json({ erro: "Informe o endereço do site entregue." }, { status: 400 });
  }
  if (!siteValido(site)) {
    return NextResponse.json(
      { erro: "Endereço do site inválido. Exemplo: https://www.seucliente.com.br" },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechadoEm)) {
    return NextResponse.json({ erro: "Informe a data do fechamento." }, { status: 400 });
  }
  if (valor === "invalido") {
    return NextResponse.json({ erro: "Valor recebido inválido. Exemplo: 1.500,00" }, { status: 400 });
  }

  const { error } = await supabase.rpc("registrar_venda", {
    p_place_id: placeId,
    p_site_url: site,
    p_fechado_em: fechadoEm,
    p_valor: valor,
  });
  if (error) return respostaErroFunil(error, "venda");

  return NextResponse.json({ venda: { siteUrl: site, fechadoEm, status: "pendente_verificacao" } });
}
