import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Conferência de administrador no servidor. Quem decide é o banco: a
// função SQL eh_admin() lê profiles.is_admin da conta logada. Nenhum
// e-mail fica escrito no código.
//
// São três camadas, de propósito:
//   1. o proxy (lib/supabase/proxy.ts) devolve erro 403 antes de montar
//      qualquer página ou rota de /painel/admin e /api/admin;
//   2. cada página e rota confere de novo aqui;
//   3. cada função SQL de administrador recusa quem não é admin.

export const MSG_FALTA_ETAPA11 =
  "O painel de Administração ainda não foi ativado no banco. Rode as 3 partes supabase/etapa11-1, etapa11-2 e etapa11-3 no Supabase, nessa ordem.";

// Função, coluna ou tabela inexistente = script da etapa 11 não rodado.
export function faltaEtapa11(codigo: string | undefined) {
  return ["PGRST202", "PGRST205", "42883", "42703", "42P01"].includes(codigo ?? "");
}

// Para páginas: quem não é administrador recebe 404 (a página "não
// existe" para essa conta). "cache" faz o layout e a página dividirem a
// mesma consulta.
export const exigirAdminPagina = cache(async (): Promise<SupabaseClient> => {
  const supabase = await createClient();
  if (!supabase) notFound();
  const { data, error } = await supabase.rpc("eh_admin");
  if (error || data !== true) notFound();
  return supabase;
});

// Para rotas de API: devolve o cliente e o usuário, ou a resposta de erro
// pronta (401 sem login, 403 sem permissão).
export async function exigirAdminApi(): Promise<
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
  const { data, error } = await supabase.rpc("eh_admin");
  if (error || data !== true) {
    return { resposta: NextResponse.json({ erro: "Acesso restrito ao administrador." }, { status: 403 }) };
  }
  return { supabase, user };
}

// Traduz o erro das funções SQL de administrador numa resposta.
export function respostaErroAdmin(error: { code?: string; message: string }, contexto: string) {
  if (faltaEtapa11(error.code)) {
    console.error(`[${contexto}] Etapa 11 não encontrada:`, error.code, error.message);
    return NextResponse.json({ erro: `${MSG_FALTA_ETAPA11} (código: ${error.code})` }, { status: 503 });
  }
  if (error.code === "P0001" || error.code === "23514") {
    return NextResponse.json({ erro: error.message }, { status: 400 });
  }
  console.error(`[${contexto}]`, error.code, error.message);
  return NextResponse.json({ erro: "Não foi possível salvar agora. Tente de novo em instantes." }, { status: 500 });
}
