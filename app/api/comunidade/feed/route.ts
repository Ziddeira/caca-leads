import { NextResponse } from "next/server";
import { exigirUsuario, respostaErro } from "@/lib/comunidade/servidor";
import type { Post } from "@/lib/comunidade/tipos";

export const dynamic = "force-dynamic";

const POR_PAGINA = 15;

// Próxima página do feed ("carrega mais ao rolar").
//   ?aba=recentes&cursor=<id do último post>   (padrão)
//   ?aba=alta&offset=<quantos já vieram>       (Em alta, últimas 48h)
//   ?apelido=<apelido>&cursor=<id>             (posts de uma pessoa)
// Só para quem está logado; a função SQL comunidade_feed confere de novo.
export async function GET(request: Request) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;

  const url = new URL(request.url);
  const apelido = url.searchParams.get("apelido")?.slice(0, 40) || null;
  const aba = !apelido && url.searchParams.get("aba") === "alta" ? "alta" : "recentes";
  const cursor = Number(url.searchParams.get("cursor"));
  const offset = Number(url.searchParams.get("offset"));

  const { data, error } = await acesso.supabase.rpc("comunidade_feed", {
    p_aba: aba,
    p_cursor: Number.isSafeInteger(cursor) && cursor > 0 ? cursor : null,
    p_offset: Number.isSafeInteger(offset) && offset > 0 ? offset : 0,
    p_apelido: apelido,
    p_limite: POR_PAGINA,
  });
  if (error) return respostaErro(error, "comunidade/feed");

  const posts = (data ?? []) as Post[];
  return NextResponse.json({ posts, temMais: posts.length === POR_PAGINA });
}
