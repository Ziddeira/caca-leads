import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { importarFotoDoGoogle } from "@/lib/perfil/fotoGoogle";

// Destino dos links que o Supabase manda por e-mail (confirmação de
// cadastro, troca de e-mail e "esqueci minha senha") e da volta do login
// com o Google (?via=google).
// "origin" é o endereço em que a pessoa está (domínio oficial,
// pré-visualização da Vercel ou localhost): ela continua nele.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = destinoSeguro(searchParams.get("next"));
  const viaGoogle = searchParams.get("via") === "google";

  // A pessoa cancelou na tela do Google ou o Supabase recusou o login.
  if (viaGoogle && (!code || searchParams.get("error"))) {
    return NextResponse.redirect(`${origin}/login?erro=google`);
  }

  const supabase = await createClient();

  if (supabase && code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Primeira entrada pelo Google: a foto da conta vira a foto inicial.
      // Depois disso, o layout do painel leva quem é novo às boas-vindas.
      if (viaGoogle && data.user) {
        await importarFotoDoGoogle(supabase, data.user);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    if (viaGoogle) {
      console.error("[auth/callback] Falha no login com o Google:", error.message);
      return NextResponse.redirect(`${origin}/login?erro=google`);
    }
  }

  // Formato alternativo (se o modelo de e-mail do Supabase for ajustado
  // para mandar token_hash): funciona mesmo se o link for aberto em outro
  // aparelho ou navegador.
  if (supabase && tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Troca de e-mail com confirmação nos dois endereços: o primeiro link
  // clicado só avisa que falta confirmar o outro (vem com "message").
  if (!code && !tokenHash && searchParams.get("message")) {
    return NextResponse.redirect(`${origin}/painel/perfil?email=parcial`);
  }

  return NextResponse.redirect(`${origin}/login?erro=confirmacao`);
}

// Só aceita caminhos internos (evita mandar o usuário para outro site).
function destinoSeguro(next: string | null) {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
    return next;
  }
  return "/painel/buscar";
}
