"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ITENS = [
  { href: "/painel/buscar", label: "Buscar" },
  { href: "/painel/meus-leads", label: "Meus leads" },
  { href: "/painel/comunidade", label: "Comunidade" },
  { href: "/painel/plano", label: "Meu plano" },
];

export default function Sidebar({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-principal.svg"
        alt="Caça-leads"
        className="mb-8 h-7 w-auto px-2"
      />

      <nav className="flex flex-1 flex-col gap-1">
        {ITENS.map((item) => {
          const ativo = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2.5 text-sm font-semibold transition ${
                ativo
                  ? "bg-primary-soft text-primary"
                  : "text-ink-2 hover:bg-canvas hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-line-2 pt-4">
        {email && (
          <p className="mb-2 truncate px-3 text-xs text-muted">{email}</p>
        )}
        <button
          onClick={sair}
          className="w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-ink-2 transition hover:bg-canvas hover:text-ink"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
