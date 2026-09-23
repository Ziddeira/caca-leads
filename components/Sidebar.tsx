"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  IconeBuscar,
  IconeComunidade,
  IconeLeads,
  IconePlano,
  IconeSair,
} from "@/components/Icones";

const ITENS = [
  { href: "/painel/buscar", label: "Buscar", curto: "Buscar", Icone: IconeBuscar },
  { href: "/painel/meus-leads", label: "Meus leads", curto: "Meus leads", Icone: IconeLeads },
  { href: "/painel/comunidade", label: "Comunidade", curto: "Comunidade", Icone: IconeComunidade },
  { href: "/painel/plano", label: "Meu plano", curto: "Plano", Icone: IconePlano },
];

// No computador (md para cima): barra lateral fixa com a logo grande.
// No celular: barra fina no topo (logo + Sair) e menu inferior fixo com
// os 4 atalhos, respeitando as áreas seguras do iPhone.
export default function Sidebar({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const ativo = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Computador -------------------------------------------------- */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-line bg-surface px-5 py-8 md:flex">
        <Link href="/painel/buscar" className="mb-10 block rounded-md px-2 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-principal.svg"
            alt="Caça-leads"
            width={808}
            height={212}
            className="h-auto w-full max-w-[216px]"
          />
        </Link>

        <nav aria-label="Menu principal" className="flex flex-1 flex-col gap-1">
          {ITENS.map(({ href, label, Icone }) => {
            const atual = ativo(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={atual ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-semibold transition ${
                  atual
                    ? "bg-primary-soft text-primary"
                    : "text-ink-2 hover:bg-canvas hover:text-ink"
                }`}
              >
                <Icone />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-line-2 pt-4">
          {email && <p className="mb-2 truncate px-3 text-xs text-muted">{email}</p>}
          <button
            onClick={sair}
            className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold text-ink-2 transition hover:bg-canvas hover:text-ink"
          >
            <IconeSair />
            Sair
          </button>
        </div>
      </aside>

      {/* Celular: topo ---------------------------------------------- */}
      <header className="pt-seguro px-seguro sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur md:hidden">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link href="/painel/buscar" className="block rounded-md py-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-principal.svg"
              alt="Caça-leads"
              width={808}
              height={212}
              className="h-10 w-auto"
            />
          </Link>
          <button
            onClick={sair}
            className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-ink-2 transition hover:bg-canvas"
          >
            <IconeSair />
            Sair
          </button>
        </div>
      </header>

      {/* Celular: menu inferior ------------------------------------- */}
      <nav
        aria-label="Menu principal"
        className="pb-seguro fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-4">
          {ITENS.map(({ href, curto, Icone }) => {
            const atual = ativo(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={atual ? "page" : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-semibold transition ${
                    atual ? "text-primary" : "text-ink-2"
                  }`}
                >
                  <span
                    className={`flex h-8 w-14 items-center justify-center rounded-full transition ${
                      atual ? "bg-primary-soft" : ""
                    }`}
                  >
                    <Icone />
                  </span>
                  {curto}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
