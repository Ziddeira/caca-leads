import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const env = getSupabaseEnv();
  if (!env) {
    // Sem as variáveis de ambiente não há como checar sessão. Deixa a
    // página seguir (em vez de derrubar o site inteiro com 500) — cada
    // rota trata a ausência de configuração por conta própria.
    console.error(
      "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
    return supabaseResponse;
  }

  const supabase = createServerClient(
    env.url,
    env.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPainel = path.startsWith("/painel");
  const isAuthPage = path === "/login" || path === "/cadastro";

  if (!user && isPainel) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Administração: quem não é administrador recebe erro já aqui, antes de
  // a página ou a rota ser montada. Quem decide é o banco (eh_admin lê
  // profiles.is_admin); as páginas, as rotas e as funções SQL conferem
  // de novo.
  const isAdmin = path.startsWith("/painel/admin") || path.startsWith("/api/admin");
  if (isAdmin) {
    const { data: ehAdmin } = user ? await supabase.rpc("eh_admin") : { data: false };
    if (ehAdmin !== true) {
      const status = user ? 403 : 401;
      if (path.startsWith("/api/")) {
        return NextResponse.json({ erro: "Acesso restrito ao administrador." }, { status });
      }
      return new NextResponse(
        '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Acesso negado</title>' +
          '<body style="font-family:system-ui,sans-serif;padding:2rem"><h1>Acesso negado (403)</h1>' +
          '<p>Esta área é restrita ao administrador.</p><p><a href="/painel/buscar">Voltar ao painel</a></p></body></html>',
        { status: 403, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/painel/buscar";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
