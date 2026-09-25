"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { ALERTA_ERRO, BOTAO, BOTAO_SECUNDARIO } from "@/components/ui";
import { chamarApi, type RespostaApi } from "@/components/comunidade/api";
import Janela from "@/components/comunidade/Janela";
import { REGRAS_MENSAGENS } from "@/lib/mensagens/regras";

// Janelas comuns das Mensagens: as regras (aceitas antes do primeiro
// pedido ou aceite — é aqui que está o aviso de que conversas
// denunciadas são lidas pela administração) e o convite para assinar.
// "executar" repete a ação depois do aceite das regras, igual à
// Comunidade. Quem decide é sempre o servidor.

interface Contexto {
  executar: <T>(acao: () => Promise<RespostaApi<T>>) => Promise<RespostaApi<T>>;
  mostrarRegras: () => void;
}

const Ctx = createContext<Contexto | null>(null);

export function useChat() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useChat fora do ChatProvider");
  return c;
}

export function ChatProvider({ regrasAceitas, children }: { regrasAceitas: boolean; children: ReactNode }) {
  const [regras, setRegras] = useState<"aceitar" | "ler" | null>(null);
  const [convite, setConvite] = useState<string | null>(null);
  const resposta = useRef<((ok: boolean) => void) | null>(null);
  const aceitas = useRef(regrasAceitas);

  const pedirRegras = useCallback(() => {
    if (aceitas.current) return Promise.resolve(true);
    setRegras("aceitar");
    return new Promise<boolean>((resolve) => {
      resposta.current = resolve;
    });
  }, []);

  const fecharRegras = useCallback((ok: boolean) => {
    if (ok) aceitas.current = true;
    setRegras(null);
    resposta.current?.(ok);
    resposta.current = null;
  }, []);

  const executar = useCallback(
    async <T,>(acao: () => Promise<RespostaApi<T>>): Promise<RespostaApi<T>> => {
      // Recusar, desfazer, bloquear e denunciar não pedem as regras; só
      // pedir, aceitar e enviar (o banco responde "regras" nesses casos).
      let r = await acao();
      if (r.codigo === "regras") {
        aceitas.current = false;
        if (await pedirRegras()) r = await acao();
      }
      if (r.codigo === "assinar" && r.erro) {
        setConvite(r.erro);
        return { ...r, erro: null };
      }
      return r;
    },
    [pedirRegras],
  );

  const mostrarRegras = useCallback(() => setRegras(aceitas.current ? "ler" : "aceitar"), []);

  return (
    <Ctx.Provider value={{ executar, mostrarRegras }}>
      {children}
      {regras && <JanelaRegras soLeitura={regras === "ler"} onFechar={fecharRegras} />}
      {convite && <ConviteAssinar texto={convite} onFechar={() => setConvite(null)} />}
    </Ctx.Provider>
  );
}

function JanelaRegras({ soLeitura, onFechar }: { soLeitura: boolean; onFechar: (ok: boolean) => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aceitar() {
    setErro(null);
    setEnviando(true);
    const r = await chamarApi("/api/mensagens/regras", "POST");
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    onFechar(true);
  }

  return (
    <Janela titulo="Regras das mensagens" onFechar={() => onFechar(false)} travada={enviando}>
      {!soLeitura && (
        <p className="text-sm text-ink-2">Antes de começar a conversar, leia como o chat funciona.</p>
      )}
      <ol className="mt-4 space-y-3">
        {REGRAS_MENSAGENS.map((r, i) => (
          <li key={r.titulo} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-primary-soft font-display text-sm font-bold text-primary">
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
        {soLeitura ? (
          <button type="button" onClick={() => onFechar(false)} className={BOTAO_SECUNDARIO}>
            Fechar
          </button>
        ) : (
          <>
            <button type="button" onClick={() => onFechar(false)} disabled={enviando} className={BOTAO_SECUNDARIO}>
              Agora não
            </button>
            <button type="button" onClick={aceitar} disabled={enviando} className={BOTAO}>
              {enviando ? "Registrando…" : "Li e aceito"}
            </button>
          </>
        )}
      </div>
    </Janela>
  );
}

function ConviteAssinar({ texto, onFechar }: { texto: string; onFechar: () => void }) {
  return (
    <Janela titulo="Converse sem limite" onFechar={onFechar}>
      <p className="text-sm text-ink-2">{texto}</p>
      <p className="mt-3 text-sm text-ink-2">
        No <strong className="text-ink">Solo</strong> e no <strong className="text-ink">Pro</strong> você envia
        pedidos de conversa e mantém quantas conversas quiser.
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
