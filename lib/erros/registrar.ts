import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Grava uma falha das rotinas do servidor na tabela "erros_servidor"
// (etapa 11), que aparece em Gestão > Erros. Usa a chave
// service_role, que só existe no servidor.
//
// Nunca derruba quem chamou: se a gravação falhar (ex.: script da etapa
// 11 ainda não rodado), só escreve no log da Vercel, como antes.
export type OrigemErro = "webhook_asaas" | "verificar_vendas" | "busca" | "notificacoes" | "cupons";

export async function registrarErro(
  origem: OrigemErro,
  mensagem: string,
  detalhe?: Record<string, unknown>,
  userId?: string | null,
) {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { error } = await admin.rpc("registrar_erro_servidor", {
      p_origem: origem,
      p_mensagem: mensagem.slice(0, 2000) || "Erro sem mensagem",
      p_detalhe: detalhe ?? null,
      p_user_id: userId ?? null,
    });
    if (error) console.error("[registrarErro]", error.code, error.message);
  } catch (e) {
    console.error("[registrarErro]", e);
  }
}
