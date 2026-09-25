"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Tempo real das Mensagens, num lugar só (montado no layout do painel):
//   * o número do menu (mensagens não lidas + pedidos recebidos);
//   * um único canal do Supabase Realtime, que a lista de conversas e a
//     conversa aberta "escutam" (ouvir), em vez de cada tela abrir o seu.
// O Realtime respeita o RLS da etapa 16: o navegador só recebe mudanças
// das conversas de que a pessoa participa.

export type EventoChat = RealtimePostgresChangesPayload<Record<string, unknown>>;

interface Resumo {
  nao_lidas: number;
  pedidos: number;
}

interface Contexto {
  resumo: Resumo | null;
  atualizar: () => void;
  ouvir: (cb: (e: EventoChat) => void) => () => void;
}

const Ctx = createContext<Contexto | null>(null);

// Fora do provider (ou sem a etapa 16), devolve null e nada quebra.
export function useMensagens() {
  return useContext(Ctx);
}

export function MensagensProvider({
  inicial,
  children,
}: {
  // null = a etapa 16 ainda não foi rodada: sem número e sem tempo real.
  inicial: Resumo | null;
  children: ReactNode;
}) {
  const ativo = inicial !== null;
  const [resumo, setResumo] = useState<Resumo | null>(inicial);
  const ouvintes = useRef(new Set<(e: EventoChat) => void>());
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscar = useCallback(async () => {
    const { data, error } = await createClient().rpc("chat_resumo");
    if (!error && data) setResumo(data as Resumo);
  }, []);

  // Várias mudanças seguidas (ex.: 10 mensagens marcadas como lidas)
  // viram uma consulta só.
  const atualizar = useCallback(() => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(buscar, 400);
  }, [buscar]);

  useEffect(() => {
    if (!ativo) return;
    const supabase = createClient();
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let cancelado = false;

    const aoMudar = (e: EventoChat) => {
      atualizar();
      ouvintes.current.forEach((cb) => cb(e));
    };

    (async () => {
      // Garante que o Realtime use o login atual (o RLS depende dele).
      await supabase.realtime.setAuth();
      if (cancelado) return;
      canal = supabase
        .channel("mensagens")
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_mensagens" }, aoMudar)
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversas" }, aoMudar)
        .subscribe();
    })();

    // Volta para a aba: reconfere (o celular pode ter derrubado a conexão).
    function aoVoltar() {
      if (document.visibilityState === "visible") atualizar();
    }
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", aoVoltar);
      if (canal) void supabase.removeChannel(canal);
      if (espera.current) clearTimeout(espera.current);
    };
  }, [ativo, atualizar]);

  const ouvir = useCallback((cb: (e: EventoChat) => void) => {
    ouvintes.current.add(cb);
    return () => {
      ouvintes.current.delete(cb);
    };
  }, []);

  return <Ctx.Provider value={{ resumo, atualizar, ouvir }}>{children}</Ctx.Provider>;
}

// Bolinha com o número no item "Mensagens" do menu.
export function ContadorMensagens({ className = "" }: { className?: string }) {
  const resumo = useMensagens()?.resumo;
  const total = (resumo?.nao_lidas ?? 0) + (resumo?.pedidos ?? 0);
  if (total <= 0) return null;
  return (
    <span
      className={`inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-display text-[11px] font-bold leading-5 text-primary-ink tabular-nums ${className}`}
    >
      {total > 99 ? "99+" : total}
      <span className="sr-only"> {total === 1 ? "novidade" : "novidades"} nas mensagens</span>
    </span>
  );
}
