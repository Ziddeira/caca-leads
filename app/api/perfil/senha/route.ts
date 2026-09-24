import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { SENHA_MIN } from "@/lib/perfil/regras";

export const dynamic = "force-dynamic";

// Troca de senha pedindo a senha atual.
// 1. Confirma a senha atual fazendo um login "de teste" num cliente
//    separado, só no servidor (não mexe na sessão do navegador).
// 2. Com essa sessão recém-criada, grava a senha nova. Por ser um login
//    novo, também atende à opção "Secure password change" do Supabase.
// 3. Encerra essa sessão de teste.
export async function POST(request: Request) {
  const env = getSupabaseEnv();
  const supabase = await createClient();
  if (!env || !supabase) {
    return NextResponse.json({ erro: "Supabase não configurado neste ambiente." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ erro: "É preciso estar logado." }, { status: 401 });
  }

  const corpo = await request.json().catch(() => null);
  const senhaAtual = typeof corpo?.senhaAtual === "string" ? corpo.senhaAtual : "";
  const novaSenha = typeof corpo?.novaSenha === "string" ? corpo.novaSenha : "";

  if (!senhaAtual) {
    return NextResponse.json({ erro: "Digite sua senha atual." }, { status: 400 });
  }
  if (novaSenha.length < SENHA_MIN) {
    return NextResponse.json(
      { erro: `A nova senha precisa ter pelo menos ${SENHA_MIN} caracteres.` },
      { status: 400 },
    );
  }
  if (novaSenha === senhaAtual) {
    return NextResponse.json({ erro: "A nova senha precisa ser diferente da atual." }, { status: 400 });
  }

  const teste = createSupabaseClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: login, error: erroLogin } = await teste.auth.signInWithPassword({
    email: user.email,
    password: senhaAtual,
  });
  if (erroLogin || login.user?.id !== user.id) {
    if (erroLogin && !erroLogin.message.includes("Invalid login credentials")) {
      console.error("[perfil/senha] Falha ao conferir senha atual:", erroLogin.message);
      return NextResponse.json(
        { erro: "Não foi possível conferir sua senha agora. Aguarde um pouco e tente de novo." },
        { status: 429 },
      );
    }
    return NextResponse.json({ erro: "A senha atual está incorreta." }, { status: 400 });
  }

  const { error: erroTroca } = await teste.auth.updateUser({ password: novaSenha });
  await teste.auth.signOut({ scope: "local" });

  if (erroTroca) {
    return NextResponse.json({ erro: traduzErroSenha(erroTroca.message) }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

function traduzErroSenha(msg: string) {
  if (msg.includes("different from the old password")) {
    return "A nova senha precisa ser diferente da atual.";
  }
  if (msg.includes("Password should") || msg.includes("weak")) {
    return "Senha fraca. Use pelo menos 6 caracteres, misturando letras e números.";
  }
  console.error("[perfil/senha] Falha ao trocar senha:", msg);
  return "Não foi possível trocar a senha agora. Tente de novo em instantes.";
}
