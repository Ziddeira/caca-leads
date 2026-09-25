import { NextResponse } from "next/server";
import { exigirUsuario, lerId, respostaErro } from "@/lib/comunidade/servidor";
import { COMENTARIO_MAX } from "@/lib/comunidade/regras";

export const dynamic = "force-dynamic";

const POR_PAGINA = 30;

// GET: comentários do post (mais antigos primeiro; ?cursor=<último id>).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;

  const id = lerId((await params).id);
  if (!id) return NextResponse.json({ erro: "Post inválido." }, { status: 400 });
  const cursor = Number(new URL(request.url).searchParams.get("cursor"));

  const { data, error } = await acesso.supabase.rpc("comunidade_comentarios_do_post", {
    p_post: id,
    p_cursor: Number.isSafeInteger(cursor) && cursor > 0 ? cursor : null,
    p_limite: POR_PAGINA,
  });
  if (error) return respostaErro(error, "comunidade/comentarios");
  const comentarios = (data ?? []) as unknown[];
  return NextResponse.json({ comentarios, temMais: comentarios.length === POR_PAGINA });
}

// POST: novo comentário (até 300 caracteres, um nível só). A função SQL
// confere regras, suspensão, limite de 50 por dia e intervalo mínimo.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;

  const id = lerId((await params).id);
  if (!id) return NextResponse.json({ erro: "Post inválido." }, { status: 400 });
  const corpo = await request.json().catch(() => null);
  const texto = typeof corpo?.texto === "string" ? corpo.texto.trim() : "";
  if (!texto) return NextResponse.json({ erro: "Escreva o comentário." }, { status: 400 });
  if ([...texto].length > COMENTARIO_MAX) {
    return NextResponse.json({ erro: `O comentário pode ter no máximo ${COMENTARIO_MAX} caracteres.` }, { status: 400 });
  }

  const { data, error } = await acesso.supabase.rpc("comunidade_comentar", { p_post: id, p_texto: texto });
  if (error) return respostaErro(error, "comunidade/comentar");
  return NextResponse.json({ comentario: data });
}
