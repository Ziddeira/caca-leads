"use client";

// Tour guiado pela Ártemis, no estilo diálogo de RPG: a tela escurece, só
// o elemento explicado fica recortado na claridade, e um balão embaixo
// mostra o texto letra por letra, com a cabeça da Ártemis ao lado.
//
// Aparece sozinho uma vez, logo depois da tela de boas-vindas (quando
// "tour_concluido_em" está vazio no perfil). Concluir ou pular grava a
// data pela rota /api/perfil/tour. O Perfil tem o botão "Rever o tour",
// que abre /painel/buscar?tour=1.
//
// Os elementos destacados são marcados no código com data-tour="nome".
// Se algum não estiver na tela, o passo é pulado: o tour nunca trava.

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type Expressao = "falando" | "foto" | "pensando" | "triste" | "feliz";

const IMAGENS: Record<Expressao, string> = {
  falando: "/artemis/artemis-falando.jpeg",
  foto: "/artemis/artemis-foto.jpeg",
  pensando: "/artemis/artemis-pensando.jpeg",
  triste: "/artemis/artemis-triste.jpeg",
  feliz: "/artemis/artemis-feliz.jpeg",
};

interface Passo {
  titulo: string;
  texto: string;
  expressao: Expressao;
  // Grupos de data-tour, tentados em ordem: vale o primeiro grupo que
  // tiver algo na tela. Dentro do grupo, todos são destacados juntos.
  alvos: string[][];
}

const PASSOS: Passo[] = [
  {
    titulo: "Buscar",
    texto:
      "Oi, eu sou a Ártemis e vou te mostrar o caminho! Aqui você escolhe o nicho e a região da caçada, e logo acima fica o seu saldo de buscas.",
    expressao: "falando",
    alvos: [["saldo", "busca"]],
  },
  {
    titulo: "Resultado",
    texto:
      "Depois da busca, a lista aparece aqui só com quem não tem site próprio. Cada lead vem com nota, número de avaliações e a situação dele.",
    expressao: "pensando",
    alvos: [["resultado"]],
  },
  {
    titulo: "Desbloquear",
    texto:
      "Gostou de um lead? Telefone e WhatsApp aparecem quando você gasta 1 crédito de desbloqueio.",
    expressao: "foto",
    // Sem resultados na tela ainda, mostra o saldo de créditos.
    alvos: [["desbloquear"], ["creditos"]],
  },
  {
    titulo: "Meus leads",
    texto:
      "Em Meus leads você acompanha a situação de cada lead, do primeiro contato até fechar a venda.",
    expressao: "falando",
    alvos: [["meus-leads"]],
  },
  {
    titulo: "Meu plano e Score",
    texto:
      "Em Meu plano ficam seu saldo e os planos, e no Score você ganha pontos a cada venda verificada. Boa caçada!",
    expressao: "feliz",
    alvos: [["plano", "score"]],
  },
];

const DESPEDIDA =
  "Tudo bem, fica para outra hora! Quando quiser rever, é só abrir o Perfil e tocar em “Rever o tour”.";

// Folga em volta do recorte, em px.
const FOLGA = 6;
// Distância do balão às bordas e ao elemento destacado.
const MARGEM = 12;
// Espaço do topo que o elemento deve ocupar ao rolar (abaixo da barra do
// topo no celular).
const TOPO_ROLAGEM = 84;
// Velocidade da digitação, em ms por letra.
const MS_POR_LETRA = 24;

interface Ret {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Menos animação no sistema ----------------------------------------------
const CONSULTA_MOVIMENTO = "(prefers-reduced-motion: reduce)";

function assinarMovimento(aviso: () => void) {
  const mq = window.matchMedia(CONSULTA_MOVIMENTO);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
}

function useMenosMovimento() {
  return useSyncExternalStore(
    assinarMovimento,
    () => window.matchMedia(CONSULTA_MOVIMENTO).matches,
    () => false,
  );
}

// Achar os elementos -------------------------------------------------------
function visivel(el: Element) {
  const r = el.getBoundingClientRect();
  return el.isConnected && r.width > 0 && r.height > 0;
}

// Computador e celular têm menus diferentes (lateral e inferior); vale o
// primeiro elemento com esse nome que estiver visível.
function acharAlvos(passo: Passo): HTMLElement[] {
  for (const grupo of passo.alvos) {
    const achados = grupo
      .map((nome) =>
        Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${nome}"]`)).find(visivel),
      )
      .filter((el): el is HTMLElement => !!el);
    if (achados.length) return achados;
  }
  return [];
}

function medir(els: HTMLElement[]): Ret[] {
  return els.map((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
}

function uniao(rets: Ret[]) {
  const topo = Math.min(...rets.map((r) => r.y));
  const base = Math.max(...rets.map((r) => r.y + r.h));
  return { topo, base };
}

function mesmosRets(a: Ret[], b: Ret[]) {
  return (
    a.length === b.length &&
    a.every(
      (r, i) =>
        Math.abs(r.x - b[i].x) < 0.5 &&
        Math.abs(r.y - b[i].y) < 0.5 &&
        Math.abs(r.w - b[i].w) < 0.5 &&
        Math.abs(r.h - b[i].h) < 0.5,
    )
  );
}

// Menus fixos (barra lateral, menu inferior do celular) não saem do lugar
// ao rolar a página; para eles, não adianta rolar.
function ficaParado(el: HTMLElement) {
  for (let atual: HTMLElement | null = el; atual; atual = atual.parentElement) {
    const pos = getComputedStyle(atual).position;
    if (pos === "fixed" || pos === "sticky") return true;
  }
  return false;
}

function rolarAte(els: HTMLElement[], suave: boolean, alturaBalao: number) {
  if (!els.length || els.some(ficaParado)) return;
  const { topo, base } = uniao(medir(els));
  const limiteBaixo = window.innerHeight - alturaBalao - MARGEM * 2;
  if (topo >= TOPO_ROLAGEM - 12 && base <= limiteBaixo) return;
  window.scrollBy({ top: topo - TOPO_ROLAGEM, behavior: suave ? "smooth" : "auto" });
}

// Componente ---------------------------------------------------------------
export default function TourArtemis({ concluido }: { concluido: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const menosMovimento = useMenosMovimento();

  const [aberto, setAberto] = useState(false);
  // null = procurando o primeiro passo na tela.
  const [indice, setIndice] = useState<number | null>(null);
  const [despedida, setDespedida] = useState(false);
  const [digitados, setDigitados] = useState(0);
  const [rets, setRets] = useState<Ret[]>([]);
  const [alturaTela, setAlturaTela] = useState(0);
  const [alturaBalao, setAlturaBalao] = useState(0);

  const elementos = useRef<HTMLElement[]>([]);
  const balao = useRef<HTMLDivElement>(null);
  const botaoPrincipal = useRef<HTMLButtonElement>(null);
  // Guardado no banco nesta visita (para não abrir de novo ao navegar).
  const jaConcluido = useRef(concluido);

  const passo = indice === null ? null : PASSOS[indice];
  const texto = despedida ? DESPEDIDA : (passo?.texto ?? "");
  const expressao: Expressao = despedida ? "triste" : (passo?.expressao ?? "falando");
  const mostrados = menosMovimento ? texto.length : Math.min(digitados, texto.length);
  const digitando = mostrados < texto.length;

  // Vai para o primeiro passo encontrado a partir de "inicio", andando na
  // direção pedida. Devolve false se não achou nenhum.
  const irPara = useCallback(
    (inicio: number, direcao: 1 | -1) => {
      for (let i = inicio; i >= 0 && i < PASSOS.length; i += direcao) {
        const els = acharAlvos(PASSOS[i]);
        if (els.length) {
          elementos.current = els;
          setIndice(i);
          setDigitados(0);
          setRets(medir(els));
          rolarAte(els, !menosMovimento, balao.current?.offsetHeight ?? 220);
          return true;
        }
      }
      return false;
    },
    [menosMovimento],
  );

  // Grava "tour visto" só uma vez. Se falhar, o tour fecha do mesmo jeito.
  const salvar = useCallback(() => {
    if (jaConcluido.current) return;
    jaConcluido.current = true;
    fetch("/api/perfil/tour", { method: "POST" }).catch(() => {});
  }, []);

  const fechar = useCallback(() => {
    setAberto(false);
    setDespedida(false);
    setIndice(null);
    elementos.current = [];
    setRets([]);
  }, []);

  const concluir = useCallback(() => {
    salvar();
    fechar();
  }, [salvar, fechar]);

  const pular = useCallback(() => {
    salvar();
    elementos.current = [];
    setRets([]);
    setDigitados(0);
    setDespedida(true);
  }, [salvar]);

  const proximo = useCallback(() => {
    if (indice === null || !irPara(indice + 1, 1)) concluir();
  }, [indice, irPara, concluir]);

  const voltar = useCallback(() => {
    if (indice !== null) irPara(indice - 1, -1);
  }, [indice, irPara]);

  // Abrir: sozinho na primeira vez, ou pelo "Rever o tour" (?tour=1).
  // Só na tela de Buscar, onde estão os três primeiros passos.
  useEffect(() => {
    if (pathname !== "/painel/buscar" || aberto) return;
    const pedido = new URLSearchParams(window.location.search).get("tour") === "1";
    if (!pedido && jaConcluido.current) return;
    if (pedido) router.replace("/painel/buscar", { scroll: false });

    // A página pode ainda estar montando: tenta por ~1,5 s antes de
    // desistir (sem gravar nada, para aparecer na próxima visita).
    let tentativas = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tentar = () => {
      if (irPara(0, 1)) {
        setDespedida(false);
        setAberto(true);
      } else if (++tentativas < 10) {
        timer = setTimeout(tentar, 150);
      }
    };
    timer = setTimeout(tentar, 150);
    return () => clearTimeout(timer);
  }, [pathname, aberto, irPara, router]);

  // Acompanha o elemento destacado a cada quadro: rolagem, giro do
  // celular e mudanças na página (lista que carrega, menu que muda).
  useEffect(() => {
    if (!aberto) return;
    let quadro = 0;
    const acompanhar = () => {
      if (!despedida && indice !== null) {
        let els = elementos.current;
        if (!els.length || els.some((el) => !visivel(el))) {
          els = acharAlvos(PASSOS[indice]);
          elementos.current = els;
        }
        const novos = medir(els);
        setRets((antes) => (mesmosRets(antes, novos) ? antes : novos));
      }
      setAlturaTela(window.innerHeight);
      setAlturaBalao(balao.current?.offsetHeight ?? 0);
      quadro = requestAnimationFrame(acompanhar);
    };
    quadro = requestAnimationFrame(acompanhar);
    return () => cancelAnimationFrame(quadro);
  }, [aberto, despedida, indice]);

  // Texto letra por letra (quem pede menos animação vê tudo de uma vez).
  useEffect(() => {
    if (!aberto || menosMovimento) return;
    const intervalo = setInterval(() => {
      setDigitados((n) => {
        if (n >= texto.length) {
          clearInterval(intervalo);
          return n;
        }
        return n + 1;
      });
    }, MS_POR_LETRA);
    return () => clearInterval(intervalo);
  }, [aberto, menosMovimento, texto]);

  // Foco no botão principal a cada passo.
  useEffect(() => {
    if (aberto) botaoPrincipal.current?.focus({ preventScroll: true });
  }, [aberto, indice, despedida]);

  // Teclado: Esc pula, setas andam, Tab fica dentro do balão.
  useEffect(() => {
    if (!aberto) return;
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (despedida) fechar();
        else pular();
      } else if (!despedida && e.key === "ArrowRight") {
        e.preventDefault();
        proximo();
      } else if (!despedida && e.key === "ArrowLeft") {
        e.preventDefault();
        voltar();
      } else if (e.key === "Tab" && balao.current) {
        const focaveis = Array.from(
          balao.current.querySelectorAll<HTMLElement>("button:not([disabled])"),
        );
        if (!focaveis.length) return;
        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];
        const atual = document.activeElement;
        if (e.shiftKey && (atual === primeiro || !balao.current.contains(atual))) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && (atual === ultimo || !balao.current.contains(atual))) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [aberto, despedida, proximo, voltar, pular, fechar]);

  if (!aberto || (indice === null && !despedida)) return null;

  // Balão: embaixo. Se o destaque ficaria atrás dele (ex.: menu inferior
  // do celular) e houver espaço, sobe para logo acima do destaque.
  let bottom = `calc(${MARGEM}px + env(safe-area-inset-bottom))`;
  if (!despedida && rets.length && alturaTela) {
    const { topo, base } = uniao(rets);
    const cabeEmbaixo = base + FOLGA + MARGEM <= alturaTela - alturaBalao - MARGEM;
    const cabeEmCima = topo - FOLGA - MARGEM >= alturaBalao + MARGEM;
    if (!cabeEmbaixo && cabeEmCima) bottom = `${alturaTela - topo + FOLGA + MARGEM}px`;
  }

  // Recortes com a folga, sem passar da borda da tela (menu inferior do
  // celular, por exemplo), para o contorno amarelo aparecer inteiro.
  const larguraTela = typeof window === "undefined" ? 0 : window.innerWidth;
  const recortes = rets.map((r) => {
    const x = Math.max(1, r.x - FOLGA);
    const y = Math.max(1, r.y - FOLGA);
    const direita = Math.min(larguraTela - 1, r.x + r.w + FOLGA);
    const baixo = Math.min((alturaTela || window.innerHeight) - 1, r.y + r.h + FOLGA);
    return { x, y, w: Math.max(0, direita - x), h: Math.max(0, baixo - y) };
  });

  const ultimo = indice === PASSOS.length - 1;
  // Voltar só faz sentido se houver um passo anterior na tela.
  const temAnterior = indice !== null && PASSOS.slice(0, indice).some((p) => acharAlvos(p).length > 0);
  const idTitulo = "tour-artemis-titulo";
  const idTexto = "tour-artemis-texto";

  return (
    <div className="fixed inset-0 z-[70]">
      {/* Tela escura com o recorte do destaque. Bloqueia cliques na
          página, mas deixa rolar. */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <mask id="tour-artemis-recorte">
            <rect width="100%" height="100%" fill="white" />
            {recortes.map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill="black" />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.8)" mask="url(#tour-artemis-recorte)" />
        {recortes.map((r, i) => (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill="none"
            stroke="var(--ap-yellow)"
            strokeWidth={2}
          />
        ))}
      </svg>

      <div
        ref={balao}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idTexto}
        className="px-seguro absolute inset-x-0 mx-auto w-full max-w-2xl"
        style={{ bottom }}
      >
        <div className="border-2 border-primary bg-surface p-3 shadow-[0_12px_40px_rgba(0,0,0,0.7)] sm:p-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <Cabeca expressao={expressao} />

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p id={idTitulo} className="font-display text-[13px] font-semibold uppercase tracking-[0.2em] text-primary">
                  Ártemis
                  {!despedida && indice !== null && (
                    <span className="ml-2 whitespace-nowrap tracking-[0.08em] text-ink-2">
                      · {indice + 1} de {PASSOS.length}
                      <span className="sr-only">: {passo?.titulo}</span>
                    </span>
                  )}
                </p>
                {!despedida && (
                  <button
                    type="button"
                    onClick={pular}
                    className="-my-2 -mr-2 inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline"
                  >
                    Pular tour
                  </button>
                )}
              </div>

              {/* O texto completo fica invisível por baixo, para o balão não
                  mudar de tamanho enquanto as letras aparecem. Leitores de
                  tela recebem o texto inteiro de uma vez. */}
              <p id={idTexto} className="sr-only" aria-live="polite">
                {texto}
              </p>
              <p
                aria-hidden="true"
                onClick={() => setDigitados(texto.length)}
                className="mt-1 grid cursor-default text-[15px] leading-snug text-ink sm:text-base"
              >
                <span className="invisible col-start-1 row-start-1">{texto}</span>
                <span className="col-start-1 row-start-1">{texto.slice(0, mostrados)}</span>
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            {digitando && (
              <button
                type="button"
                onClick={() => setDigitados(texto.length)}
                className="mr-auto inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-ink-2 hover:text-ink"
              >
                Adiantar <span aria-hidden="true">»</span>
              </button>
            )}
            {despedida ? (
              <button ref={botaoPrincipal} type="button" onClick={fechar} className={BOTAO_TOUR_PRIMARIO}>
                Fechar
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={voltar}
                  disabled={!temAnterior}
                  className={BOTAO_TOUR_SECUNDARIO}
                >
                  Voltar
                </button>
                <button ref={botaoPrincipal} type="button" onClick={proximo} className={BOTAO_TOUR_PRIMARIO}>
                  {ultimo ? "Concluir" : "Próximo"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Botões um pouco menores que os do resto do site, para caber no celular.
const BOTAO_TOUR_PRIMARIO =
  "ap-cut-s inline-flex min-h-11 items-center justify-center bg-primary px-4 py-2 font-display text-[13px] font-bold uppercase tracking-[0.06em] text-primary-ink transition hover:bg-primary-hover";
const BOTAO_TOUR_SECUNDARIO =
  "inline-flex min-h-11 items-center justify-center border border-line-strong px-4 py-2 font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-campo transition hover:border-ink-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";

// Cabeça da Ártemis num círculo branco (a mascote fica sempre sobre fundo
// claro, brand/MANUAL.md, seção 7). As cinco expressões ficam carregadas,
// só uma à vista, para a troca ser instantânea.
function Cabeca({ expressao }: { expressao: Expressao }) {
  return (
    <div
      className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-primary bg-white sm:h-20 sm:w-20"
      aria-hidden="true"
    >
      {(Object.keys(IMAGENS) as Expressao[]).map((chave) => (
        <Image
          key={chave}
          src={IMAGENS[chave]}
          alt=""
          fill
          sizes="80px"
          loading="eager"
          className={`scale-110 object-contain ${chave === expressao ? "" : "invisible"}`}
        />
      ))}
    </div>
  );
}
