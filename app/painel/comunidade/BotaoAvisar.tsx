"use client";

import { useState } from "react";
import { BOTAO, ALERTA_ERRO } from "@/components/ui";

export default function BotaoAvisar({ jaInscrito }: { jaInscrito: boolean }) {
  const [inscrito, setInscrito] = useState(jaInscrito);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function avisar() {
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/comunidade/avisar", { method: "POST" });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(dados.erro || "Não foi possível registrar agora.");
        return;
      }
      setInscrito(true);
    } catch {
      setErro("Não foi possível falar com o servidor agora.");
    } finally {
      setEnviando(false);
    }
  }

  if (inscrito) {
    return (
      <p
        role="status"
        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-wa-soft px-4 py-2.5 text-sm font-semibold text-wa"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 12 5 5 9-10" />
        </svg>
        Anotado! Você está na lista para quando a Comunidade abrir.
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <button type="button" onClick={avisar} disabled={enviando} className={`${BOTAO} w-full sm:w-auto`}>
        {enviando ? "Registrando…" : "Quero ser avisado"}
      </button>
      {erro && (
        <p role="alert" className={ALERTA_ERRO}>
          {erro}
        </p>
      )}
    </div>
  );
}
