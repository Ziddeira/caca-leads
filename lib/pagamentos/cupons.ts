import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLANOS, ehPlanoPago } from "@/lib/planos";
import { alterarValorAssinatura } from "./asaas";
import { registrarErro } from "@/lib/erros/registrar";

export const MSG_FALTA_ETAPA19 =
  "As promoções ainda não foram ativadas no banco. Rode no Supabase as 2 partes supabase/etapa19-1 e etapa19-2, nessa ordem.";

// Função, coluna ou tabela inexistente = script da etapa 19 não rodado.
export function faltaEtapa19(codigo: string | undefined) {
  return ["PGRST202", "PGRST205", "42883", "42703", "42P01"].includes(codigo ?? "");
}

// O Asaas não tem "desconto só nos N primeiros meses" em assinatura:
// a assinatura é criada com o valor já com desconto e, quando o último
// mês com desconto é pago, é aqui que o valor volta ao preço cheio.
// Chamada pelo webhook (logo depois do pagamento) e pela rotina diária
// (reserva, caso o Asaas estivesse fora do ar na hora). Nunca derruba
// quem chamou; devolve quantas assinaturas foram acertadas.
export async function voltarPrecoNormal(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin.rpc("cupons_para_voltar_preco");
  if (error) {
    if (!faltaEtapa19(error.code)) {
      console.error("[cupons] cupons_para_voltar_preco:", error.code, error.message);
    }
    return 0;
  }

  let acertadas = 0;
  for (const item of (data ?? []) as { uso_id: number; asaas_subscription_id: string; plano: string; valor: number }[]) {
    if (!ehPlanoPago(item.plano)) continue;
    try {
      await alterarValorAssinatura(
        item.asaas_subscription_id,
        Number(item.valor),
        `Ártemis Prospect — plano ${PLANOS[item.plano].nome} (mensal)`,
      );
      const marcado = await admin.rpc("marcar_preco_normal", { p_uso_id: item.uso_id });
      if (marcado.error) throw new Error(marcado.error.message);
      acertadas++;
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e);
      console.error("[cupons] não voltou ao preço normal:", item.asaas_subscription_id, mensagem);
      await registrarErro("cupons", `Falha ao voltar a assinatura ao preço normal: ${mensagem}`, {
        assinatura: item.asaas_subscription_id,
        uso_id: item.uso_id,
      });
    }
  }
  return acertadas;
}
