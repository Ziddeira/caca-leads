// Cantoneiras de mira (brand/MANUAL.md, 6.5): quatro cantos de 24 × 24 px
// com traço de 3 px amarelo, a 13 px do elemento. Uma vez só por tela, no
// elemento que deve prender o olhar.
import type { ReactNode } from "react";

const CANTO = "pointer-events-none absolute h-6 w-6 border-destaque";

export default function Mira({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative p-[13px] ${className}`}>
      <span aria-hidden="true" className={`${CANTO} left-0 top-0 border-l-[3px] border-t-[3px]`} />
      <span aria-hidden="true" className={`${CANTO} right-0 top-0 border-r-[3px] border-t-[3px]`} />
      <span aria-hidden="true" className={`${CANTO} bottom-0 left-0 border-b-[3px] border-l-[3px]`} />
      <span aria-hidden="true" className={`${CANTO} bottom-0 right-0 border-b-[3px] border-r-[3px]`} />
      {children}
    </div>
  );
}
