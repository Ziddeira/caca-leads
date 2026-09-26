import { NextResponse } from "next/server";
import { exigirAdminApi, respostaErroAdmin } from "@/lib/admin/acesso";
import { MSG_FALTA_ETAPA19, faltaEtapa19 } from "@/lib/pagamentos/cupons";

export const dynamic = "force-dynamic";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function erro(mensagem: string) {
  return NextResponse.json({ erro: mensagem }, { status: 400 });
}

function falhou(error: { code?: string; message: string }) {
  if (faltaEtapa19(error.code)) {
    console.error("[admin/promocoes] Etapa 19 não encontrada:", error.code, error.message);
    return NextResponse.json({ erro: MSG_FALTA_ETAPA19 }, { status: 503 });
  }
  return respostaErroAdmin(error, "admin/promocoes");
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

// Gestão > Promoções. Só administrador (proxy + aqui + função SQL). As
// regras (piso, datas, limites, código único) e a auditoria ficam nas
// funções SQL da etapa 19; aqui só conferimos o formato do pedido.

// Criar (sem id) ou editar (com id) um cupom.
export async function POST(request: Request) {
  const acesso = await exigirAdminApi();
  if (acesso.resposta) return acesso.resposta;

  const corpo = await request.json().catch(() => null);
  if (!corpo || typeof corpo !== "object") return erro("Pedido inválido.");

  const id = corpo.id == null ? null : Number(corpo.id);
  if (id !== null && (!Number.isInteger(id) || id <= 0)) return erro("Pedido inválido.");

  const tipo = corpo.tipo;
  if (tipo !== "percentual" && tipo !== "fixo") return erro("Escolha o tipo de desconto.");
  const valor = numero(corpo.valor);
  if (valor === null || Number.isNaN(valor)) return erro("Informe o valor do desconto.");

  const duracao = corpo.duracao == null ? null : Number(corpo.duracao);
  if (duracao !== null && duracao !== 1 && duracao !== 3) return erro("Duração inválida.");

  const planos = Array.isArray(corpo.planos) ? corpo.planos.filter((p: unknown) => p === "solo" || p === "pro") : [];
  if (planos.length === 0) return erro("Escolha em quais planos o cupom vale.");

  const inicio = typeof corpo.inicio === "string" ? corpo.inicio : "";
  const fim = typeof corpo.fim === "string" ? corpo.fim : "";
  if (!DATA.test(inicio) || !DATA.test(fim)) return erro("Informe a data de início e a de fim.");

  const limiteTotal = numero(corpo.limiteTotal);
  const limiteUsuario = numero(corpo.limiteUsuario);
  if (Number.isNaN(limiteTotal) || (limiteTotal !== null && !Number.isInteger(limiteTotal))) {
    return erro("Limite total: use um número inteiro (ou deixe em branco).");
  }
  if (limiteUsuario === null || !Number.isInteger(limiteUsuario)) return erro("Informe o limite por usuário.");

  const { data, error } = await acesso.supabase.rpc("admin_salvar_cupom", {
    p_id: id,
    p_codigo: typeof corpo.codigo === "string" ? corpo.codigo.slice(0, 40) : "",
    p_tipo: tipo,
    p_valor: valor,
    p_duracao: duracao,
    p_planos: planos,
    p_inicio: inicio,
    p_fim: fim,
    p_limite_total: limiteTotal,
    p_limite_usuario: limiteUsuario,
    p_so_novos: corpo.soNovos === true,
    p_ativo: corpo.ativo !== false,
  });
  if (error) return falhou(error);
  return NextResponse.json(data);
}

// Pausar ou reativar um cupom.
export async function PATCH(request: Request) {
  const acesso = await exigirAdminApi();
  if (acesso.resposta) return acesso.resposta;

  const corpo = await request.json().catch(() => null);
  const id = Number(corpo?.id);
  if (!Number.isInteger(id) || id <= 0 || typeof corpo?.ativo !== "boolean") return erro("Pedido inválido.");

  const { data, error } = await acesso.supabase.rpc("admin_pausar_cupom", { p_id: id, p_ativo: corpo.ativo });
  if (error) return falhou(error);
  return NextResponse.json(data);
}

// Definir o piso (custo mínimo por assinante).
export async function PUT(request: Request) {
  const acesso = await exigirAdminApi();
  if (acesso.resposta) return acesso.resposta;

  const corpo = await request.json().catch(() => null);
  const piso = numero(corpo?.piso);
  if (piso === null || Number.isNaN(piso)) return erro("Informe o piso em reais.");

  const { data, error } = await acesso.supabase.rpc("admin_definir_piso_cupons", { p_valor: piso });
  if (error) return falhou(error);
  return NextResponse.json({ piso: Number(data) });
}
