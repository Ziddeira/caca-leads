import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Botão "Limpar pesquisa" da página Buscar: apaga a última busca salva
// do usuário logado. Não devolve buscas nem créditos, e os leads já
// desbloqueados continuam em "Meus leads".
export async function DELETE() {
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

  const { error } = await supabase.rpc("limpar_ultima_busca");
  if (error) {
    console.error("[leads/ultima-busca]", error.message);
    return NextResponse.json({ erro: "Não foi possível limpar a pesquisa agora." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
