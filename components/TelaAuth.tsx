import Link from "next/link";
import type { ReactNode } from "react";
import { CARTAO } from "@/components/ui";

// Moldura das telas de entrada (login, cadastro, esqueci/redefinir senha):
// logo no topo e um cartão centralizado.
export default function TelaAuth({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="px-seguro flex min-h-screen flex-col items-center justify-center bg-canvas pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <Link href="/" className="mb-8 block rounded-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-principal.svg"
          alt="Caça-leads — voltar para o início"
          width={808}
          height={212}
          className="h-12 w-auto"
        />
      </Link>
      <div className={`${CARTAO} w-full max-w-sm p-6 sm:p-8`}>
        <h1 className="text-2xl font-extrabold text-ink">{titulo}</h1>
        <p className="mt-1.5 text-ink-2">{descricao}</p>
        {children}
      </div>
    </div>
  );
}

export const LINK_AUTH =
  "inline-flex min-h-11 items-center font-semibold text-primary underline-offset-2 hover:underline";
