import type { SupabaseClient } from "@supabase/supabase-js";
import { FOTO_BUCKET } from "./regras";

export interface DadosPerfil {
  apelido: string | null;
  fotoPath: string | null;
  fotoUrl: string | null;
  telefone: string | null;
  telefoneVerificadoEm: string | null;
}

// Link público da foto (o bucket "avatares" é de leitura pública).
export function urlDaFoto(supabase: SupabaseClient, path: string | null) {
  if (!path) return null;
  return supabase.storage.from(FOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Lê o perfil do usuário logado. Devolve "pendente: true" se as colunas
// da etapa 5 ainda não existem (o script SQL não foi rodado).
export async function lerPerfil(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ perfil: DadosPerfil | null; pendente: boolean }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("apelido, foto_path, telefone, telefone_verificado_em")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // 42703: coluna não existe → falta rodar supabase/etapa5-perfil.sql.
    return { perfil: null, pendente: error.code === "42703" };
  }
  if (!data) return { perfil: null, pendente: false };

  return {
    perfil: {
      apelido: data.apelido,
      fotoPath: data.foto_path,
      fotoUrl: urlDaFoto(supabase, data.foto_path),
      telefone: data.telefone,
      telefoneVerificadoEm: data.telefone_verificado_em,
    },
    pendente: false,
  };
}

// Erros que querem dizer "o script da etapa 5 não foi rodado":
// função inexistente (PGRST202 / 42883) ou coluna inexistente (42703).
export function faltaEtapa5(codigo: string | undefined) {
  return ["PGRST202", "42883", "42703"].includes(codigo ?? "");
}

export const MSG_FALTA_ETAPA5 =
  "O perfil ainda não foi ativado no banco. Rode o script supabase/etapa5-perfil.sql no Supabase.";
