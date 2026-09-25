"use client";

// Botão de tema: claro, escuro ou "seguir o sistema".
// - "botoes": as três opções lado a lado (menu lateral e Perfil).
// - "menu": um ícone que abre a lista (topo no celular, telas de login e
//   cadastro, página inicial).
// Com "salvar", a escolha também vai para o perfil e vale em qualquer
// aparelho. Sem login, fica só neste aparelho.
import { useEffect, useId, useRef, useState } from "react";
import { IconeLua, IconeSol, IconeTela } from "@/components/Icones";
import { TEMAS, type Tema } from "@/lib/tema";
import { aplicarTema, useTema } from "./Tema";

const OPCOES: Record<Tema, { rotulo: string; Icone: typeof IconeSol }> = {
  claro: { rotulo: "Claro", Icone: IconeSol },
  escuro: { rotulo: "Escuro", Icone: IconeLua },
  sistema: { rotulo: "Sistema", Icone: IconeTela },
};

const DICA: Record<Tema, string> = {
  claro: "Tema claro",
  escuro: "Tema escuro",
  sistema: "Seguir o tema do sistema",
};

function useEscolherTema(salvar: boolean) {
  const [erro, setErro] = useState<string | null>(null);

  async function escolher(tema: Tema) {
    aplicarTema(tema);
    setErro(null);
    if (!salvar) return;
    try {
      const resposta = await fetch("/api/perfil/tema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema }),
      });
      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => null)) as { erro?: string } | null;
        setErro(corpo?.erro ?? "Não deu para salvar no perfil. Vale só neste aparelho por enquanto.");
      }
    } catch {
      setErro("Sem conexão. O tema vale só neste aparelho por enquanto.");
    }
  }

  return { escolher, erro };
}

export default function SeletorTema({
  variante = "botoes",
  salvar = false,
  className = "",
}: {
  variante?: "botoes" | "menu";
  salvar?: boolean;
  className?: string;
}) {
  if (variante === "menu") return <MenuTema salvar={salvar} className={className} />;
  return <BotoesTema salvar={salvar} className={className} />;
}

function BotoesTema({ salvar, className }: { salvar: boolean; className: string }) {
  const atual = useTema();
  const { escolher, erro } = useEscolherTema(salvar);
  const id = useId();

  return (
    <div className={className}>
      <p id={`${id}-rotulo`} className="mb-1.5 text-xs font-semibold text-ink-2">
        Tema
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-rotulo`}
        className="grid grid-cols-3 border border-line"
      >
        {TEMAS.map((tema) => {
          const { rotulo, Icone } = OPCOES[tema];
          const marcado = atual === tema;
          return (
            <button
              key={tema}
              type="button"
              role="radio"
              aria-checked={marcado}
              title={DICA[tema]}
              onClick={() => escolher(tema)}
              className={`flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold transition ${
                marcado
                  ? "bg-primary-soft text-destaque shadow-[inset_0_-2px_0_var(--color-destaque)]"
                  : "text-ink-2 hover:bg-realce hover:text-ink"
              }`}
            >
              <Icone width={16} height={16} />
              {rotulo}
            </button>
          );
        })}
      </div>
      {erro && (
        <p role="status" className="mt-1.5 text-xs text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}

function MenuTema({ salvar, className }: { salvar: boolean; className: string }) {
  const atual = useTema();
  const { escolher, erro } = useEscolherTema(salvar);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const id = useId();

  // Fecha ao tocar fora ou apertar Esc (volta o foco para o botão).
  useEffect(() => {
    if (!aberto) return;
    function clique(e: PointerEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAberto(false);
        botao.current?.focus();
      }
    }
    document.addEventListener("pointerdown", clique);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", clique);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  // Antes de saber a escolha (servidor), mostra a lua: o padrão.
  const { Icone } = OPCOES[atual ?? "escuro"];

  return (
    // A posição (ex.: "absolute" no canto) vem de fora; a lista abre
    // presa a esta caixa interna.
    <div className={className}>
    <div ref={caixa} className="relative">
      <button
        ref={botao}
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-label={`Tema: ${atual ? OPCOES[atual].rotulo.toLowerCase() : "escuro"}. Trocar tema`}
        aria-expanded={aberto}
        aria-controls={`${id}-lista`}
        className={`flex min-h-11 min-w-11 items-center justify-center transition hover:bg-realce ${
          aberto ? "bg-primary-soft text-destaque" : "text-ink-2 hover:text-ink"
        }`}
      >
        <Icone width={20} height={20} />
      </button>

      {aberto && (
        <div
          id={`${id}-lista`}
          role="radiogroup"
          aria-label="Tema"
          className="absolute right-0 top-full z-40 mt-1 w-64 border border-line-strong bg-surface py-1 shadow-[0_12px_32px_var(--color-sombra)]"
        >
          {TEMAS.map((tema) => {
            const { Icone: IconeOpcao } = OPCOES[tema];
            const marcado = atual === tema;
            return (
              <button
                key={tema}
                type="button"
                role="radio"
                aria-checked={marcado}
                onClick={() => {
                  escolher(tema);
                  setAberto(false);
                  botao.current?.focus();
                }}
                className={`flex min-h-11 w-full items-center gap-3 border-l-[3px] px-4 text-left text-sm font-semibold transition ${
                  marcado
                    ? "border-destaque bg-primary-soft text-destaque"
                    : "border-transparent text-ink-2 hover:bg-realce hover:text-ink"
                }`}
              >
                <IconeOpcao width={18} height={18} />
                {DICA[tema]}
              </button>
            );
          })}
        </div>
      )}
      {erro && (
        <p role="status" className="absolute right-0 top-full z-40 mt-1 w-64 border border-danger/40 bg-surface px-3 py-2 text-xs text-danger">
          {erro}
        </p>
      )}
    </div>
    </div>
  );
}
