// Ilustração "Em construção" desenhada em SVG no próprio código: dois
// operários de capacete, cones e uma placa com balões de conversa (a
// Comunidade). Usa só as cores da marca. É decorativa (aria-hidden): o
// texto da página explica tudo.
const AZUL = "#2F54EB";
const AZUL_CLARO = "#EAF0FF";
const DOURADO = "#F5A300";
const DOURADO_ESCURO = "#D98F00";
const TINTA = "#172033";
const PELE = "#E8B48F";
const PELE_2 = "#B97F5A";
const LINHA = "#E4E8EF";

function Cone({ x, escala = 1 }: { x: number; escala?: number }) {
  return (
    <g transform={`translate(${x} 262) scale(${escala})`}>
      <rect x="-20" y="-6" width="40" height="7" rx="3" fill={DOURADO_ESCURO} />
      <path d="M-15 -6 L-5 -52 Q0 -56 5 -52 L15 -6 Z" fill={DOURADO} />
      <path d="M-11.5 -22 L11.5 -22 L10 -30 L-10 -30 Z" fill="#fff" />
      <path d="M-8 -38 L8 -38 L6.8 -44 L-6.8 -44 Z" fill="#fff" />
    </g>
  );
}

function Operario({
  x,
  pele,
  espelhado = false,
  children,
}: {
  x: number;
  pele: string;
  espelhado?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <g transform={`translate(${x} 0)${espelhado ? " scale(-1 1)" : ""}`}>
      {/* pernas e botas */}
      <rect x="-12" y="212" width="11" height="46" rx="4" fill={TINTA} />
      <rect x="2" y="212" width="11" height="46" rx="4" fill={TINTA} />
      <rect x="-16" y="253" width="16" height="9" rx="4" fill="#3A4560" />
      <rect x="1" y="253" width="16" height="9" rx="4" fill="#3A4560" />
      {/* braço de trás */}
      <path d="M-16 170 L-26 206" stroke={AZUL} strokeWidth="10" strokeLinecap="round" />
      <circle cx="-27" cy="209" r="5.5" fill={pele} />
      {/* tronco com colete refletivo */}
      <rect x="-20" y="158" width="40" height="60" rx="13" fill={AZUL} />
      <rect x="-12" y="160" width="6" height="30" rx="2" fill={DOURADO} />
      <rect x="6" y="160" width="6" height="30" rx="2" fill={DOURADO} />
      <rect x="-20" y="188" width="40" height="7" fill={DOURADO} />
      <rect x="-20" y="191" width="40" height="1.5" fill="#fff" opacity=".7" />
      {/* cabeça e capacete */}
      <circle cx="0" cy="140" r="15" fill={pele} />
      <circle cx="5" cy="141" r="1.8" fill={TINTA} />
      <path d="M3 148 Q7 150 10 147" stroke={TINTA} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M-16 137 A16 16 0 0 1 16 137 Z" fill={DOURADO} />
      <rect x="-2" y="121" width="4" height="16" rx="2" fill={DOURADO_ESCURO} />
      <rect x="-19" y="134" width="40" height="6" rx="3" fill={DOURADO_ESCURO} />
      {children}
    </g>
  );
}

export default function IlustracaoObra({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 290"
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id="listras-obra" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="16" fill={TINTA} />
          <rect x="8" width="8" height="16" fill={DOURADO} />
        </pattern>
        <clipPath id="placa-obra">
          <rect x="170" y="70" width="140" height="96" rx="12" />
        </clipPath>
      </defs>

      {/* fundo */}
      <circle cx="240" cy="160" r="128" fill={AZUL_CLARO} />
      <circle cx="96" cy="70" r="5" fill={DOURADO} opacity=".6" />
      <circle cx="398" cy="96" r="7" fill={AZUL} opacity=".18" />
      <circle cx="372" cy="46" r="4" fill={DOURADO} opacity=".8" />
      <path d="M86 118 l4 -10 l4 10 l-10 -5 h12 z" fill={AZUL} opacity=".25" />
      <ellipse cx="240" cy="263" rx="214" ry="11" fill={LINHA} />

      {/* placa com os balões da comunidade */}
      <rect x="199" y="160" width="9" height="102" rx="3" fill="#8A94A8" />
      <rect x="272" y="160" width="9" height="102" rx="3" fill="#8A94A8" />
      <g clipPath="url(#placa-obra)">
        <rect x="170" y="70" width="140" height="96" fill="#fff" />
        <rect x="170" y="146" width="140" height="20" fill="url(#listras-obra)" />
      </g>
      <rect x="170" y="70" width="140" height="96" rx="12" fill="none" stroke={TINTA} strokeWidth="3" />
      <path d="M190 84 h38 a10 10 0 0 1 10 10 v14 a10 10 0 0 1 -10 10 h-24 l-10 9 v-9 h-4 a10 10 0 0 1 -10 -10 v-14 a10 10 0 0 1 10 -10z" fill={AZUL} />
      <circle cx="199" cy="101" r="3" fill="#fff" />
      <circle cx="209" cy="101" r="3" fill="#fff" />
      <circle cx="219" cy="101" r="3" fill="#fff" />
      <path d="M252 96 h38 a10 10 0 0 1 10 10 v14 a10 10 0 0 1 -10 10 h-4 v9 l-10 -9 h-24 a10 10 0 0 1 -10 -10 v-14 a10 10 0 0 1 10 -10z" fill={DOURADO} />
      <path d="M254 112 h28 M254 120 h18" stroke={TINTA} strokeWidth="3" strokeLinecap="round" opacity=".55" />

      {/* operário da esquerda, com a chave inglesa balançando */}
      <Operario x={118} pele={PELE}>
        <g className="balanco-ferramenta">
          <path d="M16 170 L32 148" stroke={AZUL} strokeWidth="10" strokeLinecap="round" />
          <circle cx="34" cy="145" r="5.5" fill={PELE} />
          <path d="M34 145 L44 118" stroke="#8A94A8" strokeWidth="5" strokeLinecap="round" />
          <path d="M39 112 a8 8 0 1 0 12 5 l-5 -1 l-1 -5 z" fill="#8A94A8" />
        </g>
      </Operario>

      {/* operário da direita, pintando a placa com um rolo */}
      <Operario x={362} pele={PELE_2} espelhado>
        <g className="balanco-rolo">
          <path d="M16 172 L46 150" stroke={AZUL} strokeWidth="10" strokeLinecap="round" />
          <circle cx="48" cy="148" r="5.5" fill={PELE_2} />
          <path d="M48 148 L56 124" stroke={TINTA} strokeWidth="4" strokeLinecap="round" />
          <rect x="44" y="108" width="26" height="12" rx="6" fill={DOURADO} transform="rotate(-18 57 114)" />
        </g>
      </Operario>

      {/* cones */}
      <Cone x={44} />
      <Cone x={440} />
      <Cone x={306} escala={0.72} />
    </svg>
  );
}
