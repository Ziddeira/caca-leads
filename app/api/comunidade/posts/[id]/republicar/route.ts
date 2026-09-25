import { NextResponse } from "next/server";
import { exigirUsuario, lerId, respostaErro } from "@/lib/comunidade/servidor";
import { TEXTO_MAX } from "@/lib/comunidade/regras";

export const dynamic = "force-dynamic";

// Republicar, com ou sem comentário próprio. Só Solo e Pro: a função SQL
// comunidade_republicar confere o plano, as regras e os limites.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;

  const id = lerId((await params).id);
  if (!id) return NextResponse.json({ erro: "Post inválido." }, { status: 400 });
  const corpo = await request.json().catch(() => null);
  const texto = typeof corpo?.texto === "string" ? corpo.texto.trim() : "";
  if ([...texto].length > TEXTO_MAX) {
    return NextResponse.json({ erro: `O comentário pode ter no máximo ${TEXTO_MAX} caracteres.` }, { status: 400 });
  }

  const { data: novo, error } = await acesso.supabase.rpc("comunidade_republicar", { p_post: id, p_texto: texto });
  if (error) return respostaErro(error, "comunidade/republicar");

  const { data: post } = await acesso.supabase.rpc("comunidade_post", { p_id: novo });
  return NextResponse.json({ post });
}
