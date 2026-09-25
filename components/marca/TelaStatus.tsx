// Moldura das páginas 404 e de erro: logo no topo e código grande. A
// Ártemis aparece quando "expressao" é passada (404 e 500, chorando);
// sem ela, vai o símbolo da marca.
import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "@/components/marca/Logo";
import Mascote from "@/components/marca/Mascote";

export default function TelaStatus({
  codigo,
  titulo,
  texto,
  expressao,
  children,
}: {
  codigo: string;
  expressao?: "padrao" | "triste";
  titulo: string;
  texto: string;
  children: ReactNode;
}) {
  return (
    <div className="ap-grid px-seguro flex min-h-screen flex-col items-center justify-center pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-center">
      <Link href="/" aria-label="Ártemis Prospect — voltar para o início" className="mb-10 block">
        <Logo tamanho={24} />
      </Link>
      {expressao ? (
        <Mascote tamanho={148} expressao={expressao} />
      ) : (
        <Logo variante="simbolo" tamanho={112} />
      )}
      <p className="mt-6 font-display text-6xl font-bold italic leading-none text-primary sm:text-7xl">
        {codigo}
      </p>
      <h1 className="mt-4 text-2xl text-ink sm:text-3xl">{titulo}</h1>
      <p className="mt-2 max-w-md text-ink-2">{texto}</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">{children}</div>
    </div>
  );
}
