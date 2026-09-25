// Os 12 avatares prontos do Ártemis Prospect, desenhados em SVG aqui
// mesmo (sem imagem externa). Tema "caçador de leads", com as cores da
// marca: fundo escuro e o desenho em amarelo, branco e cinza.
import type { ReactNode } from "react";
import type { AvatarProntoId } from "@/lib/perfil/avatares";

const OURO = "#FFD60A";
const TINTA = "#A3A3A3";
const BRANCO = "#FFFFFF";
const FUNDO = "#1F1F1F";
const PRETO = "#0A0A0A";

const DESENHOS: Record<AvatarProntoId, { fundo: string; desenho: ReactNode }> = {
  mira: {
    fundo: FUNDO,
    desenho: (
      <g fill="none" stroke={BRANCO} strokeWidth="4" strokeLinecap="round">
        <circle cx="32" cy="32" r="15" />
        <path d="M32 11v10M32 43v10M11 32h10M43 32h10" />
        <circle cx="32" cy="32" r="4.5" fill={OURO} stroke="none" />
      </g>
    ),
  },
  lupa: {
    fundo: FUNDO,
    desenho: (
      <g strokeLinecap="round">
        <path d="M38 38l11 11" stroke={TINTA} strokeWidth="7" />
        <circle cx="28" cy="28" r="13" fill={BRANCO} stroke={OURO} strokeWidth="5" />
        <path d="M21 25a8 8 0 0 1 6-6" fill="none" stroke={OURO} strokeWidth="3" opacity=".6" />
      </g>
    ),
  },
  bussola: {
    fundo: FUNDO,
    desenho: (
      <g>
        <circle cx="32" cy="32" r="19" fill={BRANCO} stroke={OURO} strokeWidth="4" />
        <path d="M32 16l6 16H26z" fill={PRETO} />
        <path d="M32 48l-6-16h12z" fill={TINTA} />
        <circle cx="32" cy="32" r="3" fill={BRANCO} stroke={TINTA} strokeWidth="2" />
      </g>
    ),
  },
  foguete: {
    fundo: FUNDO,
    desenho: (
      <g strokeLinejoin="round">
        <path d="M28 44l-3 9 7-5 7 5-3-9" fill={OURO} />
        <path d="M32 10c8 6 11 16 9 30H23c-2-14 1-24 9-30z" fill={BRANCO} stroke={OURO} strokeWidth="3.5" />
        <path d="M23 34l-7 8v4l8-3M41 34l7 8v4l-8-3" fill={OURO} />
        <circle cx="32" cy="26" r="4.5" fill={OURO} />
      </g>
    ),
  },
  raio: {
    fundo: OURO,
    desenho: <path d="M36 9L17 36h13l-4 19 21-28H33z" fill={PRETO} strokeLinejoin="round" />,
  },
  estrela: {
    fundo: FUNDO,
    desenho: (
      <path
        d="M32 11l6.2 12.6 13.8 2-10 9.8 2.4 13.8L32 42.7l-12.4 6.5L22 35.4l-10-9.8 13.8-2z"
        fill={OURO}
        stroke="#FFB800"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    ),
  },
  coroa: {
    fundo: FUNDO,
    desenho: (
      <g strokeLinejoin="round">
        <path d="M14 24l9 8 9-14 9 14 9-8-4 22H18z" fill={OURO} stroke={BRANCO} strokeWidth="3" />
        <path d="M18 46h28" stroke={BRANCO} strokeWidth="3" />
        <circle cx="32" cy="36" r="3.5" fill={BRANCO} />
      </g>
    ),
  },
  trofeu: {
    fundo: FUNDO,
    desenho: (
      <g strokeLinejoin="round" strokeLinecap="round">
        <path d="M22 16h20v8a10 10 0 0 1-20 0z" fill={OURO} stroke="#FFB800" strokeWidth="2.5" />
        <path d="M22 19h-6a6 6 0 0 0 7 9M42 19h6a6 6 0 0 1-7 9" fill="none" stroke={BRANCO} strokeWidth="3" />
        <path d="M32 34v8" stroke="#FFB800" strokeWidth="4" />
        <path d="M23 49h18l-2-7H25z" fill={BRANCO} />
      </g>
    ),
  },
  diamante: {
    fundo: FUNDO,
    desenho: (
      <g strokeLinejoin="round">
        <path d="M20 16h24l8 11-20 23-20-23z" fill="#3D3D3D" stroke={OURO} strokeWidth="3" />
        <path d="M12 27h40M26 16l-4 11 10 23 10-23-4-11" fill="none" stroke={OURO} strokeWidth="2.5" />
      </g>
    ),
  },
  chama: {
    fundo: FUNDO,
    desenho: (
      <g>
        <path d="M32 9c3 9 14 14 14 27a14 14 0 0 1-28 0c0-7 4-11 7-14 0 5 3 7 5 7-2-8 0-15 2-20z" fill={BRANCO} />
        <path d="M32 31c2 5 7 7 7 13a7 7 0 0 1-14 0c0-4 3-6 4-8 1 2 2 3 3 3-1-3-1-6 0-8z" fill={OURO} />
      </g>
    ),
  },
  pin: {
    fundo: FUNDO,
    desenho: (
      <g>
        <ellipse cx="32" cy="52" rx="10" ry="3" fill={BRANCO} opacity=".2" />
        <path d="M32 52S16 38.5 16 27a16 16 0 0 1 32 0c0 11.5-16 25-16 25z" fill={BRANCO} />
        <circle cx="32" cy="27" r="7" fill={PRETO} />
        <circle cx="32" cy="27" r="3" fill={OURO} />
      </g>
    ),
  },
  binoculo: {
    fundo: FUNDO,
    desenho: (
      <g strokeLinejoin="round">
        <rect x="15" y="17" width="12" height="16" rx="3" fill={TINTA} />
        <rect x="37" y="17" width="12" height="16" rx="3" fill={TINTA} />
        <rect x="26" y="24" width="12" height="8" rx="2" fill={OURO} />
        <circle cx="21" cy="38" r="10" fill={TINTA} />
        <circle cx="43" cy="38" r="10" fill={TINTA} />
        <circle cx="21" cy="38" r="6" fill={OURO} />
        <circle cx="43" cy="38" r="6" fill={OURO} />
        <circle cx="19" cy="36" r="2" fill={BRANCO} opacity=".8" />
        <circle cx="41" cy="36" r="2" fill={BRANCO} opacity=".8" />
      </g>
    ),
  },
};

export default function AvatarPronto({
  id,
  tamanho = 40,
  className = "",
}: {
  id: AvatarProntoId;
  tamanho?: number;
  className?: string;
}) {
  const { fundo, desenho } = DESENHOS[id];
  return (
    <svg
      viewBox="0 0 64 64"
      width={tamanho}
      height={tamanho}
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 rounded-full ${className}`}
    >
      <circle cx="32" cy="32" r="32" fill={fundo} />
      {desenho}
    </svg>
  );
}
