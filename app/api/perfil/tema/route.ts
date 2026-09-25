import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { faltaEtapa5 } from "@/lib/perfil/dados";
import { temaValido } from "@/lib/tema";

export const dynamic = "force-dynamic";

// Guarda no perfil o tema escolhido (claro, escuro ou sistema), para
// valer em qualquer aparelho. Quem grava é a função SQL "definir_tema",
// que só mexe nessa coluna e sempre no perfil de quem está logado.
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
  const tema = corpo?.tema;
  if (!temaValido(tema)) {
    return NextResponse.json({ erro: "Tema inválido." }, { status: 400 });
  }

  const { error } = await supabase.rpc("definir_tema", { p_tema: tema });
  if (error) {
    // Sem o script da etapa 17 a função não existe. O tema já mudou na
    // tela e fica guardado neste aparelho; só não vai para o perfil.
    if (faltaEtapa5(error.code)) {
      return NextResponse.json(
        { erro: "O tema ainda não foi ativado no banco. Rode o script supabase/etapa17-tema.sql no Supabase." },
        { status: 503 },
      );
    }
    console.error("[perfil/tema] Falha ao salvar:", error.code, error.message);
    return NextResponse.json({ erro: "Não foi possível salvar agora." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
