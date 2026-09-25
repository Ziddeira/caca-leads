"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { ALERTA_ERRO, BOTAO, BOTAO_SECUNDARIO } from "@/components/ui";
import { REGRAS_COMUNIDADE } from "@/lib/comunidade/regras";
import type { EstadoComunidade } from "@/lib/comunidade/tipos";
import { chamarApi, type RespostaApi } from "./api";
import Janela from "./Janela";

// Estado da Comunidade compartilhado pelas peças da tela (publicar,
// curtir, comentar, republicar): quem é o usuário, se aceitou as regras,
// e as duas janelas comuns — as regras (antes da primeira publicação) e
// o convite para assinar (quando o Grátis tenta algo do Solo/Pro).
//
// A tela só ajuda: quem decide é o servidor. Se o banco responder
// "falta aceitar as regras", a janela abre e a ação é repetida depois do
// aceite; se responder "é do Solo/Pro", o convite aparece.

interface Contexto {
  estado: EstadoComunidade | null;
  userId: string | null;
  // Só para mostrar ou esconder coisas; o servidor confere de novo.
  somenteLeitura: boolean;
  pedirRegras: () => Promise<boolean>;
  mostrarConvite: (texto: string) => void;
  executar: <T>(acao: () => Promise<RespostaApi<T>>) => Promise<RespostaApi<T>>;
}

const Ctx = createContext<Contexto | null>(null);

export function useComunidade() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useComunidade fora do ComunidadeProvider");
  return c;
}

export function ComunidadeProvider({
  estado: estadoInicial,
  userId,
  somenteLeitura = false,
  children,
}: {
  estado: EstadoComunidade | null;
  userId: string | null;
  somenteLeitura?: boolean;
  children: ReactNode;
}) {
  const [estado, setEstado] = useState(estadoInicial);
  const [regrasAbertas, setRegrasAbertas] = useState(false);
  const [convite, setConvite] = useState<string | null>(null);
  const resposta = useRef<((ok: boolean) => void) | null>(null);
  const aceitas = useRef(estadoInicial?.regras_aceitas ?? false);

  const pedirRegras = useCallback(() => {
    if (aceitas.current) return Promise.resolve(true);
    setRegrasAbertas(true);
    return new Promise<boolean>((resolve) => {
      resposta.current = resolve;
    });
  }, []);

  const fecharRegras = useCallback((ok: boolean) => {
    if (ok) {
      aceitas.current = true;
      setEstado((e) => (e ? { ...e, regras_aceitas: true } : e));
    }
    setRegrasAbertas(false);
    resposta.current?.(ok);
    resposta.current = null;
  }, []);

  const mostrarConvite = useCallback((texto: string) => setConvite(texto), []);

  const executar = useCallback(
    async <T,>(acao: () => Promise<RespostaApi<T>>): Promise<RespostaApi<T>> => {
      let r = await acao();
      if (r.codigo === "regras") {
        aceitas.current = false;
        if (await pedirRegras()) r = await acao();
      }
      if (r.codigo === "assinar" && r.erro) {
        setConvite(r.erro);
        // A mensagem já aparece no convite; a tela não repete o erro.
        return { ...r, erro: null };
      }
      return r;
    },
    [pedirRegras],
  );

  return (
    <Ctx.Provider value={{ estado, userId, somenteLeitura, pedirRegras, mostrarConvite, executar }}>
      {children}
      {regrasAbertas && <JanelaRegras onFechar={fecharRegras} />}
      {convite && <ConviteAssinar texto={convite} onFechar={() => setConvite(null)} />}
    </Ctx.Provider>
  );
}

function JanelaRegras({ onFechar }: { onFechar: (ok: boolean) => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aceitar() {
    setErro(null);
    setEnviando(true);
    const r = await chamarApi("/api/comunidade/regras", "POST");
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    onFechar(true);
  }

  return (
    <Janela titulo="Regras da comunidade" onFechar={() => onFechar(false)} travada={enviando}>
      <p className="text-sm text-ink-2">
        Antes da sua primeira publicação, leia as regras. Elas valem para posts, comentários e
        republicações.
      </p>
      <ol className="mt-4 space-y-3">
        {REGRAS_COMUNIDADE.map((r, i) => (
          <li key={r.titulo} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-primary-soft font-display text-sm font-bold text-destaque">
              {i + 1}
            </span>
            <p className="text-sm text-ink-2">
              <strong className="block text-ink">{r.titulo}</strong>
              {r.texto}
            </p>
          </li>
        ))}
      </ol>
      {erro && (
        <p role="alert" className={`${ALERTA_ERRO} mt-4`}>
          {erro}
        </p>
      )}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => onFechar(false)} disabled={enviando} className={BOTAO_SECUNDARIO}>
          Agora não
        </button>
        <button type="button" onClick={aceitar} disabled={enviando} className={BOTAO}>
          {enviando ? "Registrando…" : "Li e aceito as regras"}
        </button>
      </div>
    </Janela>
  );
}

function ConviteAssinar({ texto, onFechar }: { texto: string; onFechar: () => void }) {
  return (
    <Janela titulo="Libere tudo na comunidade" onFechar={onFechar}>
      <p className="text-sm text-ink-2">{texto}</p>
      <p className="mt-3 text-sm text-ink-2">
        No <strong className="text-ink">Solo</strong> e no <strong className="text-ink">Pro</strong> você
        publica com até 4 imagens, republica posts e tem até 20 posts por dia.
      </p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onFechar} className={BOTAO_SECUNDARIO}>
          Agora não
        </button>
        <Link href="/painel/plano" className={BOTAO}>
          Ver planos
        </Link>
      </div>
    </Janela>
  );
}
