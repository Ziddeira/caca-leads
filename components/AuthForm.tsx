"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { ALERTA_ERRO, ALERTA_SUCESSO, BOTAO, CAMPO, CARTAO, ROTULO } from "@/components/ui";

type Mode = "login" | "cadastro";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    mode === "login" && searchParams.get("erro") === "confirmacao"
      ? "Não foi possível confirmar seu e-mail. O link pode ter expirado — tente se cadastrar de novo."
      : null,
  );
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    let supabase;
    try {
      supabase = createClient();
    } catch {
      setLoading(false);
      setError(
        "O sistema de login ainda não foi configurado neste ambiente. Tente novamente mais tarde.",
      );
      return;
    }

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      setLoading(false);
      if (error) {
        setError(traduzErro(error.message));
        return;
      }
      router.push("/painel/buscar");
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      setLoading(false);
      if (error) {
        setError(traduzErro(error.message));
        return;
      }
      if (data.session) {
        router.push("/painel/buscar");
        router.refresh();
      } else {
        setInfo(
          "Conta criada! Confira seu e-mail para confirmar o cadastro antes de entrar.",
        );
      }
    }
  }

  return (
    <div className="px-seguro flex min-h-screen flex-col items-center justify-center bg-canvas pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <Link href="/" className="mb-8 block rounded-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-principal.svg"
          alt="Caça-leads — voltar para o início"
          width={808}
          height={212}
          className="h-12 w-auto"
        />
      </Link>
      <div className={`${CARTAO} w-full max-w-sm p-6 sm:p-8`}>
        <h1 className="text-2xl font-extrabold text-ink">
          {mode === "login" ? "Entrar na sua conta" : "Criar conta grátis"}
        </h1>
        <p className="mt-1.5 text-ink-2">
          {mode === "login"
            ? "Use o e-mail e a senha do seu cadastro."
            : "Leva menos de um minuto."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
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
          <div>
            <label htmlFor="password" className={ROTULO}>
              Senha
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={CAMPO}
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          {error && (
            <div role="alert" className={ALERTA_ERRO}>
              {error}
            </div>
          )}
          {info && (
            <div role="status" className={ALERTA_SUCESSO}>
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`${BOTAO} mt-2 w-full text-base!`}
          >
            {loading
              ? "Aguarde..."
              : mode === "login"
                ? "Entrar"
                : "Criar conta"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-2">
          {mode === "login" ? (
            <>
              Ainda não tem conta?{" "}
              <Link href="/cadastro" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-2 hover:underline">
                Criar conta
              </Link>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <Link href="/login" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-2 hover:underline">
                Entrar
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function traduzErro(msg: string): string {
  if (msg.includes("Invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (msg.includes("User already registered")) {
    return "Já existe uma conta com esse e-mail.";
  }
  if (msg.includes("Password should be at least")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }
  return msg;
}
