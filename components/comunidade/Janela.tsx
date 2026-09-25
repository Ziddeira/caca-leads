"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconeFechar } from "@/components/Icones";

// Janela (modal) da Comunidade. No celular abre como gaveta, grudada
// embaixo e respeitando a área segura do iPhone; no computador, no meio
// da tela. Fecha com Esc, com o X ou tocando fora.
export default function Janela({
  titulo,
  onFechar,
  children,
  travada = false,
}: {
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  // Enquanto envia, não fecha por Esc nem por toque fora.
  travada?: boolean;
}) {
  const id = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = useRef(onFechar);
  const bloqueio = useRef(travada);
  useEffect(() => {
    fechar.current = onFechar;
    bloqueio.current = travada;
  });

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    caixa.current?.querySelector<HTMLElement>("textarea, input, select, button:not([data-fechar])")?.focus();
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape" && !bloqueio.current) fechar.current();
    }
    document.addEventListener("keydown", aoTeclar);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflow;
      anterior?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center sm:p-6"
      onClick={(e) => e.target === e.currentTarget && !travada && onFechar()}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain border border-line bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-lg sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={`${id}-titulo`} className="text-lg font-bold text-ink">
            {titulo}
          </h2>
          <button
            type="button"
            data-fechar
            onClick={onFechar}
            disabled={travada}
            aria-label="Fechar"
            className="-mr-2 -mt-2 flex min-h-11 min-w-11 items-center justify-center text-ink-2 transition hover:text-ink disabled:opacity-50"
          >
            <IconeFechar />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
