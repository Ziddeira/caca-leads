import { NextResponse } from "next/server";
import { exigirUsuario, lerId, respostaErro } from "@/lib/comunidade/servidor";

export const dynamic = "force-dynamic";

// Curtir ({ curtir: true }) ou descurtir ({ curtir: false }). Qualquer
// plano; quem está suspenso não curte (a função SQL recusa).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;

  const id = lerId((await params).id);
  const corpo = await request.json().catch(() => null);
  if (!id || typeof corpo?.curtir !== "boolean") {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const { data, error } = await acesso.supabase.rpc("comunidade_curtir", { p_post: id, p_curtir: corpo.curtir });
  if (error) return respostaErro(error, "comunidade/curtir");
  return NextResponse.json(data);
}
