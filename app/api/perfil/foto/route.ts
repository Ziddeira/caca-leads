import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MSG_FALTA_ETAPA5, faltaEtapa5 } from "@/lib/perfil/dados";
import { FOTO_BUCKET } from "@/lib/perfil/regras";

export const dynamic = "force-dynamic";

// O navegador envia a foto direto para o Storage (pasta do próprio
// usuário, garantida pelas regras do bucket) e depois chama esta rota
// para gravar o caminho no perfil. Aqui também apagamos a foto antiga.
//   POST   { path } → passa a usar essa foto
//   DELETE          → remove a foto
async function definirFoto(path: string | null) {
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

  // A função SQL recusa qualquer caminho fora da pasta do usuário.
  const { data: antiga, error } = await supabase.rpc("definir_foto_perfil", { p_path: path });

  if (error) {
    if (faltaEtapa5(error.code)) {
      return NextResponse.json({ erro: MSG_FALTA_ETAPA5 }, { status: 503 });
    }
    console.error("[perfil/foto] Falha ao gravar foto:", error.code, error.message);
    return NextResponse.json({ erro: "Não foi possível salvar a foto agora." }, { status: 500 });
  }

  if (typeof antiga === "string" && antiga && antiga !== path) {
    // Se falhar, só sobra um arquivo sem uso: não vale travar o usuário.
    const { error: erroRemover } = await supabase.storage.from(FOTO_BUCKET).remove([antiga]);
    if (erroRemover) {
      console.error("[perfil/foto] Falha ao apagar foto antiga:", erroRemover.message);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const corpo = await request.json().catch(() => null);
  const path = typeof corpo?.path === "string" ? corpo.path : "";
  if (!path) {
    return NextResponse.json({ erro: "Foto não informada." }, { status: 400 });
  }
  return definirFoto(path);
}

export async function DELETE() {
  return definirFoto(null);
}
