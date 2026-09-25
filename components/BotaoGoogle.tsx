"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ALERTA_ERRO } from "@/components/ui";

// "Entrar com o Google" das telas de login e cadastro (no cadastro, a
// conta é criada na primeira entrada). O Google devolve a pessoa para
// /auth/callback no MESMO endereço em que ela está (domínio oficial,
// pré-visualização da Vercel ou localhost), e lá a sessão é criada. Quem
// é novo cai nas boas-vindas pelo layout do painel.
export default function BotaoGoogle() {
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar() {
    setErro(null);
    setIndo(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?via=google`,
          // Deixa escolher a conta, em vez de entrar direto na última usada.
          queryParams: { prompt: "select_account" },
        },
      });
      // Sem erro, o navegador já está indo para o Google.
      if (error) {
        setIndo(false);
        setErro("Não foi possível abrir o login do Google agora. Tente de novo.");
      }
    } catch {
      setIndo(false);
      setErro("O sistema de login ainda não foi configurado neste ambiente. Tente novamente mais tarde.");
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={entrar}
        disabled={indo}
        className="inline-flex min-h-11 w-full items-center justify-center gap-3 border border-line-strong bg-canvas px-5 py-3 text-center font-display text-sm font-bold uppercase leading-tight tracking-[0.08em] text-ink transition hover:border-ink-2 disabled:cursor-wait disabled:opacity-70"
      >
        <IconeGoogle />
        {indo ? "Abrindo o Google…" : "Entrar com o Google"}
      </button>
      {erro && (
        <div role="alert" className={`${ALERTA_ERRO} mt-3`}>
          {erro}
        </div>
      )}
      <div className="mt-6 flex items-center gap-3 text-sm text-ink-3">
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
        ou com e-mail e senha
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
      </div>
    </div>
  );
}

// "G" colorido oficial do Google. As cores são fixas (regra do Google) e
// ficam legíveis tanto em fundo escuro quanto claro.
export function IconeGoogle({ tamanho = 18 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
