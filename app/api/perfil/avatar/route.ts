import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MSG_FALTA_ETAPA6, faltaEtapa5 } from "@/lib/perfil/dados";
import { ehAvatarPronto } from "@/lib/perfil/avatares";
import { FOTO_BUCKET } from "@/lib/perfil/regras";

export const dynamic = "force-dynamic";

// Escolhe um dos avatares prontos. A função SQL confere se o avatar
// existe, grava no perfil de quem está logado e tira a foto enviada
// (se havia) — o arquivo antigo é apagado do Storage aqui.
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
  const avatar = corpo?.avatar;
  if (!ehAvatarPronto(avatar)) {
    return NextResponse.json({ erro: "Avatar inválido." }, { status: 400 });
  }

  const { data: fotoAntiga, error } = await supabase.rpc("definir_avatar_pronto", { p_avatar: avatar });
  if (error) {
    if (faltaEtapa5(error.code)) {
      return NextResponse.json({ erro: MSG_FALTA_ETAPA6 }, { status: 503 });
    }
    console.error("[perfil/avatar] Falha ao gravar avatar:", error.code, error.message);
    return NextResponse.json({ erro: "Não foi possível salvar o avatar agora." }, { status: 500 });
  }

  if (typeof fotoAntiga === "string" && fotoAntiga) {
    const { error: erroRemover } = await supabase.storage.from(FOTO_BUCKET).remove([fotoAntiga]);
    if (erroRemover) {
      console.error("[perfil/avatar] Falha ao apagar foto antiga:", erroRemover.message);
    }
  }

  return NextResponse.json({ ok: true });
}
