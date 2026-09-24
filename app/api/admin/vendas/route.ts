import { NextResponse } from "next/server";
import { exigirAdminApi, faltaEtapa11, respostaErroAdmin } from "@/lib/admin/acesso";
import { respostaErroVenda } from "@/lib/vendas/erros";

export const dynamic = "force-dynamic";

// Aprovar ou recusar o comprovante de uma venda. A rota confere o
// administrador (profiles.is_admin) e a função SQL
// admin_analisar_comprovante confere de novo no banco e anota na
// auditoria quem decidiu — não dá para pular pela tela nem chamando a
// rota direto.
export async function POST(request: Request) {
  const acesso = await exigirAdminApi();
  if (acesso.resposta) return acesso.resposta;

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

  const { data, error } = await acesso.supabase.rpc("admin_analisar_comprovante", {
    p_venda_id: vendaId,
    p_aprovar: aprovar,
    p_motivo: motivo || null,
  });
  if (error) {
    return faltaEtapa11(error.code) ? respostaErroAdmin(error, "admin/vendas") : respostaErroVenda(error, "admin/vendas");
  }

  return NextResponse.json({ status: data });
}
