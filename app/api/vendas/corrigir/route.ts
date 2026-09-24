import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizarSite, siteValido } from "@/lib/leads/funil";
import { respostaErroVenda } from "@/lib/vendas/erros";

export const dynamic = "force-dynamic";

// O usuário corrige o endereço do site de uma venda ainda não resolvida.
// A venda volta para "pendente" e entra na próxima verificação semanal.
// Quem confere dono, situação e formato é a função SQL corrigir_site_venda.
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
  if (!placeId) {
    return NextResponse.json({ erro: "place_id é obrigatório." }, { status: 400 });
  }
  if (!site || !siteValido(site)) {
    return NextResponse.json(
      { erro: "Endereço do site inválido. Exemplo: https://www.seucliente.com.br" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("corrigir_site_venda", { p_place_id: placeId, p_site_url: site });
  if (error) return respostaErroVenda(error, "vendas/corrigir");

  return NextResponse.json({ siteUrl: data, status: "pendente_verificacao" });
}
