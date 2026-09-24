import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respostaErroVenda } from "@/lib/vendas/erros";

export const dynamic = "force-dynamic";

// Aprovar ou recusar o comprovante de uma venda. Só funciona para quem
// está na tabela "administradores": a função SQL analisar_comprovante
// confere isso no banco, com o usuário logado — não dá para pular pela
// tela nem chamando a rota direto.
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
  const vendaId = Number(corpo?.vendaId);
  const aprovar = corpo?.aprovar === true;
  const motivo = typeof corpo?.motivo === "string" ? corpo.motivo.trim().slice(0, 500) : "";
  if (!Number.isInteger(vendaId) || vendaId <= 0 || typeof corpo?.aprovar !== "boolean") {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  if (!aprovar && !motivo) {
    return NextResponse.json({ erro: "Explique o motivo da recusa (o usuário vai ver)." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("analisar_comprovante", {
    p_venda_id: vendaId,
    p_aprovar: aprovar,
    p_motivo: motivo || null,
  });
  if (error) return respostaErroVenda(error, "admin/vendas");

  return NextResponse.json({ status: data });
}
