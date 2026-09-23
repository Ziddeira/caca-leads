import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Registra o clique em "Quero ser avisado" da Comunidade. Só grava no
// banco quem clicou e quando; não envia e-mail nenhum.
export async function POST() {
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

  const { error } = await supabase.rpc("quero_ser_avisado_comunidade");
  if (error) {
    return NextResponse.json(
      { erro: "Não foi possível registrar agora. Tente de novo em instantes." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
