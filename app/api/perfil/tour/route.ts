import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { faltaEtapa5 } from "@/lib/perfil/dados";

export const dynamic = "force-dynamic";

// Termina (ou pula) o tour guiado da Ártemis. A função SQL guarda a data
// só da primeira vez; rever o tour pelo Perfil não muda nada.
export async function POST() {
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

  const { error } = await supabase.rpc("concluir_tour");
  if (error) {
    // Sem o script da etapa 13 a função não existe. O tour já fechou na
    // tela; só não fica guardado.
    if (faltaEtapa5(error.code)) {
      return NextResponse.json(
        { erro: "O tour ainda não foi ativado no banco. Rode o script supabase/etapa13-tour.sql no Supabase." },
        { status: 503 },
      );
    }
    console.error("[perfil/tour] Falha ao concluir:", error.code, error.message);
    return NextResponse.json({ erro: "Não foi possível salvar agora." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
