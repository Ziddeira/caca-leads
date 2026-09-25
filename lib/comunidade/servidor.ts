import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMUNIDADE_BUCKET, MSG_FALTA_ETAPA14, faltaEtapa14, type CodigoComunidade } from "./regras";

// Peças comuns das rotas /api/comunidade/*. Toda regra (plano, limite,
// suspensão, dono do conteúdo) é conferida pelas funções SQL da etapa 14;
// aqui só se confere o login e se traduz o erro do banco numa resposta.

export async function exigirUsuario(): Promise<
  { supabase: SupabaseClient; user: User; resposta?: never } | { resposta: NextResponse }
> {
  const supabase = await createClient();
  if (!supabase) {
    return { resposta: NextResponse.json({ erro: "Supabase não configurado neste ambiente." }, { status: 500 }) };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { resposta: NextResponse.json({ erro: "É preciso estar logado." }, { status: 401 }) };
  }
  return { supabase, user };
}

// Códigos próprios que as funções SQL usam (veja o topo de etapa14-2).
const CODIGOS: Record<string, { status: number; codigo: CodigoComunidade }> = {
  AP402: { status: 402, codigo: "assinar" },
  AP423: { status: 423, codigo: "suspenso" },
  AP428: { status: 428, codigo: "regras" },
  AP429: { status: 429, codigo: "limite" },
};

export function respostaErro(error: { code?: string; message: string }, contexto: string) {
  const proprio = error.code ? CODIGOS[error.code] : undefined;
  if (proprio) {
    return NextResponse.json({ erro: error.message, codigo: proprio.codigo }, { status: proprio.status });
  }
  if (faltaEtapa14(error.code)) {
    console.error(`[${contexto}] Etapa 14 não encontrada:`, error.code, error.message);
    return NextResponse.json({ erro: `${MSG_FALTA_ETAPA14} (código: ${error.code})` }, { status: 503 });
  }
  if (error.code === "P0001" || error.code === "23514") {
    return NextResponse.json({ erro: error.message }, { status: 400 });
  }
  console.error(`[${contexto}]`, error.code, error.message);
  return NextResponse.json({ erro: "Não foi possível concluir agora. Tente de novo em instantes." }, { status: 500 });
}

// Id numérico vindo da URL ("/api/comunidade/posts/123").
export function lerId(valor: string): number | null {
  const n = Number(valor);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// Apaga imagens do bucket. Com a chave service_role apaga de qualquer
// pasta (administrador removendo post de outra pessoa); sem ela, usa a
// sessão do usuário, que pelas regras do bucket só apaga da própria pasta.
// Falhar aqui só deixa um arquivo sem uso: não trava quem pediu.
export async function apagarImagens(supabase: SupabaseClient, paths: string[]) {
  if (!paths.length) return;
  const cliente = createAdminClient() ?? supabase;
  const { error } = await cliente.storage.from(COMUNIDADE_BUCKET).remove(paths);
  if (error) console.error("[comunidade] Falha ao apagar imagens:", error.message);
}
