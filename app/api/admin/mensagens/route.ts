import { NextResponse } from "next/server";
import { exigirAdminApi } from "@/lib/admin/acesso";
import { respostaErroChat } from "@/lib/mensagens/servidor";
import { NOTA_MODERACAO_MAX } from "@/lib/mensagens/regras";

export const dynamic = "force-dynamic";

// Gestão > Mensagens: decidir uma denúncia de conversa.
//   { acao: "decidir", id, situacao: "resolvida" | "descartada", nota }
// Suspender o denunciado usa a mesma rota da Comunidade
// (/api/admin/comunidade, acao "suspender").
export async function POST(request: Request) {
  const acesso = await exigirAdminApi();
  if (acesso.resposta) return acesso.resposta;

  const corpo = await request.json().catch(() => null);
  const id = Number(corpo?.id);
  const situacao = corpo?.situacao;
  const nota = typeof corpo?.nota === "string" ? corpo.nota.trim() : "";

  if (
    corpo?.acao !== "decidir" ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    (situacao !== "resolvida" && situacao !== "descartada")
  ) {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  if ([...nota].length > NOTA_MODERACAO_MAX) {
    return NextResponse.json({ erro: `A anotação pode ter no máximo ${NOTA_MODERACAO_MAX} caracteres.` }, { status: 400 });
  }

  const { error } = await acesso.supabase.rpc("admin_chat_decidir", {
    p_id: id,
    p_situacao: situacao,
    p_nota: nota || null,
  });
  if (error) return respostaErroChat(error, "admin/mensagens");
  return NextResponse.json({ ok: true });
}
