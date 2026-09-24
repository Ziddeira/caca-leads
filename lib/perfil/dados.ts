import type { SupabaseClient } from "@supabase/supabase-js";
import { FOTO_BUCKET } from "./regras";

export interface DadosPerfil {
  apelido: string | null;
  fotoPath: string | null;
  fotoUrl: string | null;
  avatarPronto: string | null;
  telefone: string | null;
  telefoneVerificadoEm: string | null;
  // false = ainda não passou pela tela de boas-vindas.
  configuracaoConcluida: boolean;
}

// Link público da foto (o bucket "avatares" é de leitura pública).
export function urlDaFoto(supabase: SupabaseClient, path: string | null) {
  if (!path) return null;
  return supabase.storage.from(FOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

const COLUNAS_ETAPA5 = "apelido, foto_path, telefone, telefone_verificado_em";
const COLUNAS_ETAPA6 = `${COLUNAS_ETAPA5}, avatar_pronto, configuracao_inicial_em`;

// Lê o perfil do usuário logado.
// "pendente" diz qual script SQL falta rodar: "etapa5" (sem apelido,
// foto e telefone) ou "etapa6" (sem avatares prontos e boas-vindas).
// Sem a etapa 6, o resto do perfil funciona e a tela de boas-vindas
// simplesmente não aparece.
export async function lerPerfil(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ perfil: DadosPerfil | null; pendente: "etapa5" | "etapa6" | null }> {
  const completo = await supabase.from("profiles").select(COLUNAS_ETAPA6).eq("id", userId).maybeSingle();

  // 42703: coluna não existe.
  if (completo.error?.code === "42703") {
    const basico = await supabase.from("profiles").select(COLUNAS_ETAPA5).eq("id", userId).maybeSingle();
    if (basico.error || !basico.data) {
      return { perfil: null, pendente: basico.error?.code === "42703" ? "etapa5" : null };
    }
    const d = basico.data;
    return {
      perfil: {
        apelido: d.apelido,
        fotoPath: d.foto_path,
        fotoUrl: urlDaFoto(supabase, d.foto_path),
        avatarPronto: null,
        telefone: d.telefone,
        telefoneVerificadoEm: d.telefone_verificado_em,
        configuracaoConcluida: true,
      },
      pendente: "etapa6",
    };
  }

  if (completo.error || !completo.data) return { perfil: null, pendente: null };

  const d = completo.data;
  return {
    perfil: {
      apelido: d.apelido,
      fotoPath: d.foto_path,
      fotoUrl: urlDaFoto(supabase, d.foto_path),
      avatarPronto: d.avatar_pronto,
      telefone: d.telefone,
      telefoneVerificadoEm: d.telefone_verificado_em,
      configuracaoConcluida: d.configuracao_inicial_em !== null,
    },
    pendente: null,
  };
}

// Erros que querem dizer "o script da etapa 5 não foi rodado":
// função inexistente (PGRST202 / 42883) ou coluna inexistente (42703).
export function faltaEtapa5(codigo: string | undefined) {
  return ["PGRST202", "42883", "42703"].includes(codigo ?? "");
}

export const MSG_FALTA_ETAPA5 =
  "O perfil ainda não foi ativado no banco. Rode o script supabase/etapa5-perfil.sql no Supabase.";

export const MSG_FALTA_ETAPA6 =
  "Os avatares prontos ainda não foram ativados no banco. Rode o script supabase/etapa6-boas-vindas.sql no Supabase.";
