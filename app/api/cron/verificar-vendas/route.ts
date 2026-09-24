import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAutorizado } from "@/lib/cron/autorizacao";
import { verificarVenda } from "@/lib/vendas/verificacao";
import { registrarErro } from "@/lib/erros/registrar";

export const dynamic = "force-dynamic";
// Tempo máximo desta rota na Vercel (segundos). O lote para sozinho
// antes disso (ver TEMPO_UTIL_MS) para dar tempo de gravar os resultados.
export const maxDuration = 300;

const TAMANHO_LOTE = 20;
const SIMULTANEAS = 5;
const TEMPO_UTIL_MS = 240_000;

interface VendaLote {
  venda_id: number;
  place_id: string;
  site_url: string;
  nome_empresa: string | null;
}

// Rotina agendada (Vercel Cron, uma vez por semana). Pede ao banco um
// lote de vendas para verificar — o banco já respeita "1 vez por semana
// por venda" e o limite mensal de cada usuário —, confere cada uma e
// grava o resultado. Repete até acabar ou o tempo apertar; o que sobrar
// fica para a próxima rodada.
export async function GET(request: Request) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ erro: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, { status: 500 });
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json({ erro: "GOOGLE_PLACES_API_KEY não configurada." }, { status: 500 });
  }

  const inicio = Date.now();
  const contagem: Record<string, number> = {};

  // Aproveita a rodada para fechar algum mês que tenha ficado para trás.
  const fechamento = await admin.rpc("fechar_meses_pendentes");
  if (fechamento.error) {
    console.error("[cron/verificar] fechar mês:", fechamento.error.message);
    await registrarErro("verificar_vendas", `Fechar mês do rank falhou: ${fechamento.error.message}`, {
      codigo: fechamento.error.code,
    });
  }

  while (Date.now() - inicio < TEMPO_UTIL_MS) {
    const { data, error } = await admin.rpc("vendas_para_verificar", { p_limite: TAMANHO_LOTE });
    const lote = data as VendaLote[] | null;
    if (error) {
      console.error("[cron/verificar] lote:", error.code, error.message);
      await registrarErro("verificar_vendas", `Buscar lote de vendas falhou: ${error.message}`, { codigo: error.code, contagem });
      return NextResponse.json({ erro: error.message, contagem }, { status: 500 });
    }
    if (!lote?.length) break;

    for (let i = 0; i < lote.length; i += SIMULTANEAS) {
      await Promise.all(lote.slice(i, i + SIMULTANEAS).map((v) => processar(admin, v, contagem)));
    }
  }

  console.log("[cron/verificar] resultado:", JSON.stringify(contagem));
  return NextResponse.json({ contagem, segundos: Math.round((Date.now() - inicio) / 1000) });
}

async function processar(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  venda: VendaLote,
  contagem: Record<string, number>,
) {
  const v = await verificarVenda({
    placeId: venda.place_id,
    siteUrl: venda.site_url,
    nomeEmpresa: venda.nome_empresa,
  }).catch(async (e) => {
    console.error("[cron/verificar] falha inesperada:", venda.venda_id, e);
    await registrarErro("verificar_vendas", `Falha inesperada ao verificar a venda ${venda.venda_id}: ${e instanceof Error ? e.message : String(e)}`, {
      venda_id: venda.venda_id,
    });
    return null;
  });
  if (!v) {
    contagem.falha = (contagem.falha ?? 0) + 1;
    return;
  }

  const { data, error } = await admin.rpc("registrar_verificacao_venda", {
    p_venda_id: venda.venda_id,
    p_resultado: v.resultado,
    p_site_testado: venda.site_url,
    p_site_no_ar: v.siteNoAr,
    p_dominio_proprio: v.dominioProprio,
    p_google_confere: v.googleConfere,
    p_motivo: v.motivo,
    p_chamou_google: v.chamouGoogle,
  });
  if (error) {
    console.error("[cron/verificar] gravar:", venda.venda_id, error.code, error.message);
    await registrarErro("verificar_vendas", `Gravar verificação da venda ${venda.venda_id} falhou: ${error.message}`, {
      venda_id: venda.venda_id,
      codigo: error.code,
    });
    contagem.falha = (contagem.falha ?? 0) + 1;
    return;
  }
  const chave = v.resultado === "erro_temporario" ? "erro_temporario" : String(data);
  contagem[chave] = (contagem[chave] ?? 0) + 1;
}
