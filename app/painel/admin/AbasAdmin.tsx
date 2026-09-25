"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ABA_ATIVA, ABA_INATIVA } from "@/components/ui";

const ABAS = [
  { href: "/painel/admin", rotulo: "Visão geral" },
  { href: "/painel/admin/uso", rotulo: "Uso e custo" },
  { href: "/painel/admin/pagamentos", rotulo: "Pagamentos" },
  { href: "/painel/admin/erros", rotulo: "Erros" },
  { href: "/painel/admin/avisos", rotulo: "Avisos" },
  { href: "/painel/admin/usuarios", rotulo: "Usuários" },
  { href: "/painel/admin/vendas", rotulo: "Vendas a aprovar" },
  { href: "/painel/admin/suporte", rotulo: "Suporte" },
  { href: "/painel/admin/comunidade", rotulo: "Comunidade" },
  { href: "/painel/admin/mensagens", rotulo: "Mensagens" },
];

// Sub-abas da Gestão. No celular, a faixa rola para o lado.
export default function AbasAdmin() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções da gestão" className="-mx-4 mt-5 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1 border border-line bg-surface p-1">
        {ABAS.map((a) => {
          const atual = a.href === "/painel/admin" ? pathname === a.href : pathname.startsWith(a.href);
          return (
            <li key={a.href}>
              <Link
                href={a.href}
                aria-current={atual ? "page" : undefined}
                className={`flex min-h-11 items-center whitespace-nowrap px-4 font-display text-sm font-semibold uppercase tracking-[0.08em] transition ${
                  atual ? ABA_ATIVA : ABA_INATIVA
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
