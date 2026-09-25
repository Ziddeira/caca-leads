import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstadoComunidade } from "./tipos";

// Leitura do estado do usuário na comunidade para as páginas do painel.
// "pendente" = o script da etapa 14 ainda não foi rodado.
export async function lerEstado(
  supabase: SupabaseClient,
): Promise<{ estado: EstadoComunidade | null; erro: { code?: string; message: string } | null }> {
  const { data, error } = await supabase.rpc("comunidade_meu_estado");
  if (error) return { estado: null, erro: error };
  return { estado: data as EstadoComunidade, erro: null };
}
