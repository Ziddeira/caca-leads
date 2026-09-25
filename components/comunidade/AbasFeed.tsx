import Link from "next/link";
import { ABA_ATIVA, ABA_INATIVA } from "@/components/ui";

// "Recentes" e "Em alta" (curtidas e comentários das últimas 48h).
export default function AbasFeed({ atual }: { atual: "recentes" | "alta" }) {
  const abas = [
    { id: "recentes", rotulo: "Recentes", href: "/painel/comunidade" },
    { id: "alta", rotulo: "Em alta", href: "/painel/comunidade?aba=alta" },
  ] as const;
  return (
    <nav aria-label="Ordem do feed" className="mb-4">
      <ul className="grid grid-cols-2 border border-line bg-surface p-1">
        {abas.map((a) => (
          <li key={a.id}>
            <Link
              href={a.href}
              aria-current={atual === a.id ? "page" : undefined}
              className={`flex min-h-11 items-center justify-center font-display text-sm font-semibold uppercase tracking-[0.08em] transition ${
                atual === a.id ? ABA_ATIVA : ABA_INATIVA
              }`}
            >
              {a.rotulo}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
