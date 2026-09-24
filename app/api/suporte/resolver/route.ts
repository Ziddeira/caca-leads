import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// O próprio usuário marca o chamado como resolvido (libera espaço no
// limite de 5 abertos). A função SQL só mexe em chamado do próprio dono.
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
  const id = Number(corpo?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const { error } = await supabase.rpc("resolver_meu_chamado", { p_id: id });
  if (error) {
    if (error.code === "P0001") return NextResponse.json({ erro: error.message }, { status: 400 });
    console.error("[suporte/resolver]", error.code, error.message);
    return NextResponse.json({ erro: "Não foi possível salvar agora." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
