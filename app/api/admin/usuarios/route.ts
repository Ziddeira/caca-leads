import { NextResponse } from "next/server";
import { exigirAdminApi, respostaErroAdmin } from "@/lib/admin/acesso";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Ajustar plano e saldo de uma conta. A função SQL admin_ajustar_conta
// confere o administrador, valida os valores e grava o antes/depois na
// auditoria (quem fez e quando).
export async function POST(request: Request) {
  const acesso = await exigirAdminApi();
  if (acesso.resposta) return acesso.resposta;

  const corpo = await request.json().catch(() => null);
  const userId = typeof corpo?.userId === "string" ? corpo.userId : "";
  const plano = corpo?.plano;
  const creditos = Number(corpo?.creditos);
  const buscas = Number(corpo?.buscas);
  const validoAte = typeof corpo?.validoAte === "string" && DATA.test(corpo.validoAte) ? corpo.validoAte : null;
  const motivo = typeof corpo?.motivo === "string" ? corpo.motivo.trim().slice(0, 500) : "";

  if (!UUID.test(userId) || !["gratis", "solo", "pro"].includes(plano)) {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  if (!Number.isInteger(creditos) || !Number.isInteger(buscas)) {
    return NextResponse.json({ erro: "Use números inteiros no saldo." }, { status: 400 });
  }

  const { data, error } = await acesso.supabase.rpc("admin_ajustar_conta", {
    p_user_id: userId,
    p_plano: plano,
    p_creditos: creditos,
    p_buscas: buscas,
    p_valido_ate: validoAte,
    p_motivo: motivo,
  });
  if (error) return respostaErroAdmin(error, "admin/usuarios");
  return NextResponse.json(data);
}
