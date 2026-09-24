"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/painel/admin", rotulo: "Visão geral" },
  { href: "/painel/admin/uso", rotulo: "Uso e custo" },
  { href: "/painel/admin/pagamentos", rotulo: "Pagamentos" },
  { href: "/painel/admin/erros", rotulo: "Erros" },
  { href: "/painel/admin/avisos", rotulo: "Avisos" },
  { href: "/painel/admin/usuarios", rotulo: "Usuários" },
  { href: "/painel/admin/vendas", rotulo: "Vendas a aprovar" },
];

// Sub-abas da Gestão. No celular, a faixa rola para o lado.
export default function AbasAdmin() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções da gestão" className="-mx-4 mt-5 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1 rounded-lg border border-line bg-surface p-1">
        {ABAS.map((a) => {
          const atual = a.href === "/painel/admin" ? pathname === a.href : pathname.startsWith(a.href);
          return (
            <li key={a.href}>
              <Link
                href={a.href}
                aria-current={atual ? "page" : undefined}
                className={`flex min-h-11 items-center whitespace-nowrap rounded-md px-4 text-sm font-semibold transition ${
                  atual ? "bg-primary text-primary-ink" : "text-ink-2 hover:bg-canvas hover:text-ink"
                }`}
              >
                {a.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
