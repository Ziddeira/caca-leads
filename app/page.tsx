import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/painel/buscar");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-principal.svg"
        alt="Caça-leads"
        className="mb-8 h-9 w-auto"
      />
      <h1 className="max-w-xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        Encontre clientes sem site para o seu trabalho de web designer
      </h1>
      <p className="mt-4 max-w-md text-ink-2">
        Prospecção de leads para quem cria sites e páginas de forma
        independente.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/cadastro"
          className="rounded-md bg-primary px-6 py-3 font-semibold text-primary-ink transition hover:brightness-110"
        >
          Criar conta grátis
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-line bg-surface px-6 py-3 font-semibold text-ink transition hover:bg-canvas"
        >
          Entrar
        </Link>
      </div>
    </div>
  );
}
