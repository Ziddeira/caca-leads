import Link from "next/link";
import type { ReactNode } from "react";
import { CARTAO } from "@/components/ui";
import Logo from "@/components/marca/Logo";
import Mira from "@/components/marca/Mira";

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
      <Link href="/" aria-label="Ártemis Prospect — voltar para o início" className="mb-8 block">
        <Logo tamanho={28} />
      </Link>
      {/* O cartão do formulário é o elemento principal: leva as cantoneiras. */}
      <Mira className="w-full max-w-[26.5rem]">
        <div className={`${CARTAO} p-6 sm:p-8`}>
          <h1 className="text-[1.75rem] leading-tight text-ink">{titulo}</h1>
          <p className="mt-1.5 text-ink-2">{descricao}</p>
          {children}
        </div>
      </Mira>
    </div>
  );
}

export const LINK_AUTH =
  "inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline";
