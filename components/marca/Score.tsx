// Badge de score do lead (brand/MANUAL.md, 6.4): quadrado de 48 px com
// canto cortado e o número em Chakra Petch 700.
//
// Faixas: o código já tratava 60+ como lead "quente" (em destaque). Isso
// continua: de 60 para cima o número fica amarelo. O manual separa o
// topo (80+) com fundo amarelo. Abaixo de 60, contorno cinza.
export type FaixaScore = "alto" | "medio" | "baixo";

export function faixaScore(pontos: number): FaixaScore {
  if (pontos >= 80) return "alto";
  if (pontos >= 60) return "medio";
  return "baixo";
}

const ESTILO: Record<FaixaScore, string> = {
  alto: "bg-primary text-primary-ink",
  medio: "text-destaque shadow-[inset_0_0_0_2px_var(--color-destaque)]",
  baixo: "text-ink shadow-[inset_0_0_0_2px_var(--color-cinza)]",
};

export default function Score({
  pontos,
  destaque = false,
  className = "",
  title,
}: {
  pontos: number;
  // 56 px em destaque, 48 px no resto.
  destaque?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`ap-cut-s flex shrink-0 items-center justify-center font-display text-xl font-bold tabular-nums ${
        destaque ? "h-14 w-14" : "h-12 w-12"
      } ${ESTILO[faixaScore(pontos)]} ${className}`}
    >
      <span className="sr-only">Pontuação </span>
      {pontos}
    </span>
  );
}
