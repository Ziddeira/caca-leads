"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "cadastro";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();

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
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 shadow-[0_1px_2px_rgba(23,32,51,.04),0_4px_16px_rgba(23,32,51,.05)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-principal.svg"
          alt="Caça-leads"
          className="mb-6 h-8 w-auto"
        />
        <h1 className="text-xl font-bold text-ink">
          {mode === "login" ? "Entrar na sua conta" : "Criar conta grátis"}
        </h1>
        <p className="mt-1 text-sm text-ink-2">
          {mode === "login"
            ? "Use o e-mail e a senha do seu cadastro."
            : "Leva menos de um minuto."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-semibold text-ink-2">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary-soft"
              placeholder="voce@exemplo.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-semibold text-ink-2">
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
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary-soft"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          {error && (
            <div className="rounded-md border border-[#F6CACA] bg-[#FDECEC] px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-md border border-wa/30 bg-wa-soft px-3 py-2 text-sm text-wa">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-ink transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
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
              <Link href="/cadastro" className="font-semibold text-primary">
                Criar conta
              </Link>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <Link href="/login" className="font-semibold text-primary">
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
