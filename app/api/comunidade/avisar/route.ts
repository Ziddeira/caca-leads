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
    console.error("[comunidade/avisar] Falha ao registrar interesse:", error.code, error.message);
    // PGRST202 / 42883: a função não existe. 42P01: a tabela não existe.
    // Os dois casos querem dizer que o script da etapa 4 não foi rodado.
    if (["PGRST202", "42883", "42P01"].includes(error.code)) {
      return NextResponse.json(
        {
          erro: "A lista de espera ainda não foi ativada no banco. Rode o script supabase/etapa4-cache-leads-comunidade.sql no Supabase.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { erro: "Não foi possível registrar agora. Tente de novo em instantes." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
