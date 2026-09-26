import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ehPlanoPago } from "@/lib/planos";
import { faltaEtapa19 } from "@/lib/pagamentos/cupons";

export const dynamic = "force-dynamic";

// Mostra o preço com o cupom ANTES de assinar. Só consulta: não reserva
// nada e não cria cobrança. Na hora de assinar, o servidor recalcula o
// preço no banco — o valor que esta rota devolve nunca volta do
// navegador como preço.
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ erro: "Supabase não configurado neste ambiente." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "É preciso estar logado." }, { status: 401 });

  const corpo = await request.json().catch(() => null);
  const codigo = typeof corpo?.codigo === "string" ? corpo.codigo.trim().slice(0, 40) : "";
  if (!codigo) return NextResponse.json({ erro: "Digite o código do cupom." }, { status: 400 });
  if (!ehPlanoPago(corpo?.plano)) return NextResponse.json({ erro: "Escolha o plano Solo ou Pro." }, { status: 400 });

  const { data, error } = await supabase
    .rpc("conferir_cupom", { p_codigo: codigo, p_plano: corpo.plano })
    .single<{ codigo: string; plano: string; valor_cheio: number; valor_final: number; duracao_meses: number | null }>();

  if (error) {
    if (error.code === "P0001") return NextResponse.json({ erro: error.message }, { status: 400 });
    if (faltaEtapa19(error.code)) {
      return NextResponse.json({ erro: "Cupons ainda não estão disponíveis." }, { status: 503 });
    }
    console.error("[plano/cupom]", error.code, error.message);
    return NextResponse.json({ erro: "Não foi possível conferir o cupom agora." }, { status: 500 });
  }

  return NextResponse.json({
    codigo: data.codigo,
    plano: data.plano,
    valorCheio: Number(data.valor_cheio),
    valorFinal: Number(data.valor_final),
    duracaoMeses: data.duracao_meses,
  });
}
