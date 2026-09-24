import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Destino dos links que o Supabase manda por e-mail: confirmação de
// cadastro, troca de e-mail e "esqueci minha senha".
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = destinoSeguro(searchParams.get("next"));

  const supabase = await createClient();

  if (supabase && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
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
