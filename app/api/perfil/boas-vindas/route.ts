import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MSG_FALTA_ETAPA6, faltaEtapa5 } from "@/lib/perfil/dados";

export const dynamic = "force-dynamic";

// Termina (ou pula) a tela de boas-vindas. A função SQL marca a
// configuração inicial como concluída e, se a pessoa ficou sem foto e sem
// avatar, sorteia um dos avatares prontos.
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

  const { error } = await supabase.rpc("concluir_configuracao_inicial");
  if (error) {
    if (faltaEtapa5(error.code)) {
      return NextResponse.json({ erro: MSG_FALTA_ETAPA6 }, { status: 503 });
    }
    console.error("[perfil/boas-vindas] Falha ao concluir:", error.code, error.message);
    return NextResponse.json({ erro: "Não foi possível concluir agora. Tente de novo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
