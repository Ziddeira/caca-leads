import { NextResponse } from "next/server";
import { exigirUsuario, respostaErro } from "@/lib/comunidade/servidor";

export const dynamic = "force-dynamic";

// Liga/desliga o número de vendas verificadas no perfil público da
// Comunidade. A função SQL só mexe nessa coluna, no perfil de quem está logado.
export async function POST(request: Request) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;

  const corpo = await request.json().catch(() => null);
  if (typeof corpo?.mostrarVendas !== "boolean") {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const { error } = await acesso.supabase.rpc("definir_mostrar_vendas_comunidade", {
    p_mostrar: corpo.mostrarVendas,
  });
  if (error) return respostaErro(error, "perfil/comunidade");
  return NextResponse.json({ ok: true });
}
