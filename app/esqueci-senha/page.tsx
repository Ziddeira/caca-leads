"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { ALERTA_ERRO, ALERTA_SUCESSO, BOTAO, CAMPO, ROTULO } from "@/components/ui";
import TelaAuth, { LINK_AUTH } from "@/components/TelaAuth";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/redefinir-senha`,
      });
      if (error) {
        setErro(
          error.status === 429
            ? "Muitos pedidos seguidos. Aguarde um minuto e tente de novo."
            : "Não foi possível enviar agora. Tente de novo em instantes.",
        );
        return;
      }
      // Mesmo que o e-mail não tenha conta, mostramos a mesma mensagem:
      // assim ninguém descobre quem é cliente testando endereços.
      setEnviado(true);
    } catch {
      setErro("O sistema de login ainda não foi configurado neste ambiente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <TelaAuth
      titulo="Esqueci minha senha"
      descricao="Digite o e-mail do seu cadastro. Vamos mandar um link para você criar uma senha nova."
    >
      {enviado ? (
        <div role="status" className={`${ALERTA_SUCESSO} mt-6`}>
          Se existir uma conta com <strong>{email.trim()}</strong>, o link chega em
          alguns minutos. Abra o link <strong>neste mesmo navegador</strong>. Confira
          também a caixa de spam.
        </div>
      ) : (
        <form onSubmit={enviar} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="email" className={ROTULO}>
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={CAMPO}
              placeholder="voce@exemplo.com"
            />
          </div>
          {erro && (
            <div role="alert" className={ALERTA_ERRO}>
              {erro}
            </div>
          )}
          <button type="submit" disabled={enviando} className={`${BOTAO} mt-2 w-full text-base!`}>
            {enviando ? "Enviando…" : "Enviar link"}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-ink-2">
        Lembrou a senha?{" "}
        <Link href="/login" className={LINK_AUTH}>
          Voltar para o login
        </Link>
      </p>
    </TelaAuth>
  );
}
