// Logo do Ártemis Prospect (brand/MANUAL.md, seção 2). O símbolo é SVG
// e o nome é texto em Chakra Petch, então a logo fica nítida em qualquer
// tamanho. "tamanho" é o corpo de ÁRTEMIS em px (o --s do manual): na
// sidebar 32, no hero 64 ou mais. Todas as medidas saem dele.
type Variante = "horizontal" | "vertical" | "simbolo" | "nome";
// "tema" (padrão): segue o tema do site, pelas variáveis --logo-* de
// app/globals.css (no escuro, a versão principal; no claro, a versão
// sobre branco). "escuro" e "claro" fixam a versão, para fundos que não
// mudam com o tema.
type Fundo = "tema" | "escuro" | "claro";

const CORES: Record<
  Fundo,
  { a: string; losango: string; cantos: string; nome: string; sub: string; traco: string }
> = {
  escuro: { a: "#FFD60A", losango: "#FFFFFF", cantos: "#3D3D3D", nome: "#FFFFFF", sub: "#FFD60A", traco: "#FFD60A" },
  claro: { a: "#0A0A0A", losango: "#0A0A0A", cantos: "#D4D4D4", nome: "#0A0A0A", sub: "#0A0A0A", traco: "#FFD60A" },
  tema: {
    a: "var(--logo-a)",
    losango: "var(--logo-losango)",
    cantos: "var(--logo-cantos)",
    nome: "var(--logo-nome)",
    sub: "var(--logo-sub)",
    traco: "var(--logo-traco)",
  },
};

export function Simbolo({
  tamanho,
  fundo = "tema",
  className = "",
}: {
  tamanho: number;
  fundo?: Fundo;
  className?: string;
}) {
  const c = CORES[fundo];
  return (
    <svg
      viewBox="0 0 64 64"
      width={tamanho}
      height={tamanho}
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <path
        d="M4 14V4h10M50 4h10v10M4 50v10h10M60 50v10H50"
        style={{ stroke: c.cantos }}
        strokeWidth="2.5"
        strokeLinecap="square"
      />
      <polygon points="32,10 54,54 43,54 32,31 21,54 10,54" style={{ fill: c.a }} />
      <polygon points="32,40 36,45 32,50 28,45" style={{ fill: c.losango }} />
    </svg>
  );
}

function Assinatura({ s, fundo, centro }: { s: number; fundo: Fundo; centro?: boolean }) {
  const c = CORES[fundo];
  return (
    <span
      className={`flex flex-col font-display ${centro ? "items-center" : ""}`}
      style={{ gap: s * 0.11 }}
    >
      <span
        style={{
          fontSize: s,
          fontWeight: 700,
          fontStyle: "italic",
          lineHeight: 0.9,
          letterSpacing: "0.02em",
          color: c.nome,
        }}
      >
        ÁRTEMIS
      </span>
      <span
        className="flex items-center"
        style={{
          gap: s * 0.15,
          fontSize: s * 0.24,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: "0.55em",
          color: c.sub,
          // O espaçamento de 0,55em sobra depois da última letra; tira
          // a sobra para o nome ficar centrado de verdade.
          marginRight: centro ? "-0.55em" : undefined,
        }}
      >
        <i
          className="block"
          style={{ width: s * 0.48, height: Math.max(2, s * 0.043), background: c.traco }}
        />
        PROSPECT
      </span>
    </span>
  );
}

export default function Logo({
  variante = "horizontal",
  tamanho = 22,
  fundo = "tema",
  className = "",
}: {
  variante?: Variante;
  tamanho?: number;
  fundo?: Fundo;
  className?: string;
}) {
  const s = tamanho;
  if (variante === "simbolo") {
    return (
      <span role="img" aria-label="Ártemis Prospect" className={`inline-flex ${className}`}>
        <Simbolo tamanho={s} fundo={fundo} />
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label="Ártemis Prospect"
      className={`inline-flex select-none ${
        variante === "vertical" ? "flex-col items-center" : "items-center"
      } ${className}`}
      style={{ gap: variante === "vertical" ? s * 0.25 : s * 0.35 }}
    >
      {variante !== "nome" && <Simbolo tamanho={s * 1.6} fundo={fundo} />}
      <Assinatura s={s} fundo={fundo} centro={variante === "vertical"} />
    </span>
  );
}
