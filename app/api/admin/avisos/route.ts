import { NextResponse } from "next/server";
import { exigirAdminApi, respostaErroAdmin } from "@/lib/admin/acesso";

export const dynamic = "force-dynamic";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Criar aviso do sino. As regras (tamanho, link interno, datas, plano) e
// a conferência de administrador ficam na função SQL admin_criar_aviso.
export async function POST(request: Request) {
  const acesso = await exigirAdminApi();
  if (acesso.resposta) return acesso.resposta;

  const corpo = await request.json().catch(() => null);
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const inicio = texto(corpo?.inicio);
  const fim = texto(corpo?.fim);
  const plano = texto(corpo?.plano);
  if (!DATA.test(inicio) || !DATA.test(fim)) {
    return NextResponse.json({ erro: "Informe a data de início e a de fim." }, { status: 400 });
  }
  if (plano && !["gratis", "solo", "pro"].includes(plano)) {
    return NextResponse.json({ erro: "Plano inválido." }, { status: 400 });
  }

  const { data, error } = await acesso.supabase.rpc("admin_criar_aviso", {
    p_titulo: texto(corpo?.titulo).slice(0, 200),
    p_texto: texto(corpo?.texto).slice(0, 1000),
    p_link: texto(corpo?.link) || null,
    p_inicio: inicio,
    p_fim: fim,
    p_plano: plano || null,
  });
  if (error) return respostaErroAdmin(error, "admin/avisos");
  return NextResponse.json(data);
}

// Apagar aviso: some do sino de todo mundo.
export async function DELETE(request: Request) {
  const acesso = await exigirAdminApi();
  if (acesso.resposta) return acesso.resposta;

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  const { error } = await acesso.supabase.rpc("admin_apagar_aviso", { p_id: id });
  if (error) return respostaErroAdmin(error, "admin/avisos");
  return NextResponse.json({ ok: true });
}
