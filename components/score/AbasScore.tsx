import Link from "next/link";
import { ABA_ATIVA, ABA_INATIVA } from "@/components/ui";

// Abas no topo das páginas Score e Rank. No celular, o menu de baixo tem
// só "Score": é por aqui que se chega ao Rank.
export default function AbasScore({ atual }: { atual: "score" | "rank" }) {
  const abas = [
    { id: "score", href: "/painel/score", rotulo: "Meu score" },
    { id: "rank", href: "/painel/rank", rotulo: "Rank do mês" },
  ] as const;
  return (
    <nav aria-label="Score e rank" className="mb-6 flex gap-1 border border-line bg-surface p-1 sm:inline-flex">
      {abas.map((a) => (
        <Link
          key={a.id}
          href={a.href}
          aria-current={a.id === atual ? "page" : undefined}
          className={`flex min-h-11 flex-1 items-center justify-center px-4 font-display text-sm font-semibold uppercase tracking-[0.08em] transition sm:flex-none ${
            a.id === atual ? ABA_ATIVA : ABA_INATIVA
          }`}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
