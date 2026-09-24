import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respostaErroVenda } from "@/lib/vendas/erros";

export const dynamic = "force-dynamic";

// O navegador envia o arquivo direto para o Storage (bucket privado
// "comprovantes", pasta do próprio usuário, até 5 MB, imagem ou PDF —
// regras do bucket) e depois chama esta rota para ligar o arquivo à venda.
// A função SQL enviar_comprovante confere dono, situação, número de
// tentativas e se o arquivo existe mesmo.
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
  const path = typeof corpo?.path === "string" ? corpo.path : "";
  if (!Number.isInteger(vendaId) || vendaId <= 0 || !path) {
    return NextResponse.json({ erro: "Comprovante inválido." }, { status: 400 });
  }

  const { error } = await supabase.rpc("enviar_comprovante", { p_venda_id: vendaId, p_path: path });
  if (error) return respostaErroVenda(error, "vendas/comprovante");

  return NextResponse.json({ status: "em_analise" });
}
