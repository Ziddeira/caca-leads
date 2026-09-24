"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { IconeFechar, IconeSino } from "@/components/Icones";

// Central de notificações (sino). As notificações nascem só no servidor,
// pela rotina diária (supabase/etapa9-2-rotina-notificacoes.sql); aqui o
// navegador apenas LÊ as do próprio usuário, marca como lidas e apaga,
// sempre pelas funções SQL da etapa 9.
//
// O sino aparece em dois lugares (topo do celular e topo do computador),
// mas os dados ficam num só lugar — este "provider" —, então a contagem
// é buscada uma vez e as duas cópias mostram sempre o mesmo número.

type Tipo = "renovacao" | "saldo" | "novidade" | "incentivo" | "retorno";

export interface Notificacao {
  id: number;
  tipo: Tipo;
  titulo: string;
  texto: string;
  link: string | null;
  criado_em: string;
  lida_em: string | null;
}

interface Estado {
  naoLidas: number;
  lista: Notificacao[] | null;
  // Ids que estavam não lidas quando o painel abriu: continuam
  // destacadas até fechar, para a pessoa ver o que é novo.
  novas: Set<number>;
  carregando: boolean;
  erro: string | null;
  abrir: () => void;
  apagar: (ids: number[] | null) => void;
}

const Contexto = createContext<Estado | null>(null);

const LIMITE = 50;

export function NotificacoesProvider({
  naoLidasInicial,
  children,
}: {
  // null = a etapa 9 ainda não foi rodada no Supabase: o sino não aparece.
  naoLidasInicial: number | null;
  children: ReactNode;
}) {
  const ativo = naoLidasInicial !== null;
  const [naoLidas, setNaoLidas] = useState(naoLidasInicial ?? 0);
  const [lista, setLista] = useState<Notificacao[] | null>(null);
  const [novas, setNovas] = useState<Set<number>>(() => new Set());
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const contar = useCallback(async () => {
    const { count, error } = await createClient()
      .from("notificacoes")
      .select("id", { count: "exact", head: true })
      .is("lida_em", null);
    if (!error && count !== null) setNaoLidas(count);
  }, []);

  // A rotina roda uma vez por dia: basta reconferir a contagem quando a
  // pessoa volta para a aba do site.
  useEffect(() => {
    if (!ativo) return;
    function aoVoltar() {
      if (document.visibilityState === "visible") contar();
    }
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [ativo, contar]);

  const abrir = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("notificacoes")
      .select("id, tipo, titulo, texto, link, criado_em, lida_em")
      .order("criado_em", { ascending: false })
      .order("id", { ascending: false })
      .limit(LIMITE);
    setCarregando(false);
    if (error) {
      setErro("Não foi possível carregar as notificações. Tente de novo.");
      return;
    }
    const itens = (data ?? []) as Notificacao[];
    const ids = itens.filter((n) => !n.lida_em).map((n) => n.id);
    setLista(itens);
    setNovas(new Set(ids));
    if (ids.length === 0) {
      setNaoLidas(0);
      return;
    }
    // Abriu = viu. Marca como lidas no banco; se falhar, a contagem
    // simplesmente continua a mesma e tenta de novo na próxima abertura.
    const { error: erroMarcar } = await supabase.rpc("marcar_notificacoes_lidas", { p_ids: ids });
    if (!erroMarcar) contar();
  }, [contar]);

  // null = apagar todas.
  const apagar = useCallback(
    async (ids: number[] | null) => {
      const antes = lista;
      setLista((atual) => (ids === null ? [] : (atual ?? []).filter((n) => !ids.includes(n.id))));
      const { error } = await createClient().rpc("apagar_notificacoes", { p_ids: ids });
      if (error) {
        setLista(antes);
        setErro("Não foi possível apagar. Tente de novo.");
        return;
      }
      contar();
    },
    [lista, contar],
  );

  const valor: Estado | null = ativo
    ? { naoLidas, lista, novas, carregando, erro, abrir, apagar }
    : null;

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

const ROTULO_TIPO: Record<Tipo, string> = {
  renovacao: "Plano",
  saldo: "Saldo",
  novidade: "Novidade",
  incentivo: "Dica",
  retorno: "Retorno",
};

const COR_TIPO: Record<Tipo, string> = {
  renovacao: "bg-primary-soft text-primary",
  saldo: "bg-hot-soft text-hot-ink",
  novidade: "bg-booking-soft text-booking",
  incentivo: "bg-wa-soft text-wa",
  retorno: "bg-rede-soft text-rede",
};

function quando(iso: string) {
  const fuso = "America/Sao_Paulo";
  const dia = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: fuso });
  const data = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86_400_000);
  if (dia(data) === dia(hoje)) return "Hoje";
  if (dia(data) === dia(ontem)) return "Ontem";
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: fuso });
}

// O botão do sino e o painel que abre embaixo dele. No celular o painel
// ocupa a largura da tela, logo abaixo da barra do topo; no computador,
// é uma caixa presa ao sino.
export function Sino({ className = "" }: { className?: string }) {
  const estado = useContext(Contexto);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const idPainel = useId();

  const fechar = useCallback((devolverFoco = true) => {
    setAberto(false);
    if (devolverFoco) botao.current?.focus();
  }, []);

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!aberto) return;
    function clique(e: PointerEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) fechar(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") fechar();
    }
    document.addEventListener("pointerdown", clique);
    document.addEventListener("keydown", tecla);
    titulo.current?.focus();
    return () => {
      document.removeEventListener("pointerdown", clique);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto, fechar]);

  if (!estado) return null;
  const { naoLidas, lista, novas, carregando, erro, abrir, apagar } = estado;

  function alternar() {
    if (aberto) {
      fechar();
      return;
    }
    setAberto(true);
    abrir();
  }

  const contador = naoLidas > 9 ? "9+" : String(naoLidas);
  const rotulo =
    naoLidas === 0
      ? "Notificações"
      : `Notificações, ${naoLidas} não ${naoLidas === 1 ? "lida" : "lidas"}`;

  return (
    <div ref={caixa} className={`md:relative ${className}`}>
      <button
        ref={botao}
        type="button"
        onClick={alternar}
        aria-label={rotulo}
        aria-expanded={aberto}
        aria-controls={idPainel}
        className={`relative flex min-h-11 min-w-11 items-center justify-center rounded-md transition hover:bg-canvas ${
          aberto ? "bg-canvas text-primary" : "text-ink-2"
        }`}
      >
        <IconeSino width={22} height={22} />
        {naoLidas > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold leading-none text-white ring-2 ring-surface"
          >
            {contador}
          </span>
        )}
      </button>

      {aberto && (
        <section
          id={idPainel}
          aria-labelledby={`${idPainel}-titulo`}
          className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-10rem)] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-cartao md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-2 md:max-h-[70vh] md:w-[26rem]"
        >
          <header className="flex items-center justify-between gap-2 border-b border-line-2 px-4 py-2">
            <h2
              id={`${idPainel}-titulo`}
              ref={titulo}
              tabIndex={-1}
              className="text-base font-bold text-ink outline-none"
            >
              Notificações
            </h2>
            <div className="flex items-center">
              {lista && lista.length > 0 && (
                <button
                  type="button"
                  onClick={() => apagar(null)}
                  className="min-h-11 rounded-md px-3 text-sm font-semibold text-ink-2 transition hover:bg-canvas hover:text-ink"
                >
                  Apagar todas
                </button>
              )}
              <button
                type="button"
                onClick={() => fechar()}
                aria-label="Fechar notificações"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-2 transition hover:bg-canvas md:hidden"
              >
                <IconeFechar />
              </button>
            </div>
          </header>

          <div className="overflow-y-auto overscroll-contain">
            {erro && <p className="px-4 py-3 text-sm text-danger">{erro}</p>}
            {!lista && carregando && (
              <p className="px-4 py-6 text-center text-sm text-muted">Carregando…</p>
            )}
            {lista && lista.length === 0 && !erro && (
              <p className="px-4 py-10 text-center text-sm text-muted">
                Nenhuma notificação por aqui.
              </p>
            )}
            {lista && lista.length > 0 && (
              <ul className="divide-y divide-line-2">
                {lista.map((n) => {
                  const nova = novas.has(n.id);
                  const conteudo = (
                    <>
                      <span className="flex items-center gap-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${COR_TIPO[n.tipo]}`}>
                          {ROTULO_TIPO[n.tipo]}
                        </span>
                        <span className="text-muted">{quando(n.criado_em)}</span>
                        {nova && (
                          <span className="flex items-center gap-1 font-semibold text-primary">
                            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
                            Nova
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block font-semibold text-ink">{n.titulo}</span>
                      <span className="mt-0.5 block text-sm text-ink-2">{n.texto}</span>
                    </>
                  );
                  return (
                    <li key={n.id} className={`flex items-start gap-1 ${nova ? "bg-primary-soft/40" : ""}`}>
                      {n.link ? (
                        <Link
                          href={n.link}
                          onClick={() => fechar(false)}
                          className="block min-w-0 flex-1 px-4 py-3 transition hover:bg-canvas"
                        >
                          {conteudo}
                        </Link>
                      ) : (
                        <div className="min-w-0 flex-1 px-4 py-3">{conteudo}</div>
                      )}
                      <button
                        type="button"
                        onClick={() => apagar([n.id])}
                        aria-label={`Apagar notificação: ${n.titulo}`}
                        className="mr-1 mt-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-canvas hover:text-ink"
                      >
                        <IconeFechar width={18} height={18} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
