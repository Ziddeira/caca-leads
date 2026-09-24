"use client";

// Janela para ajustar a foto de perfil antes do envio: a foto aparece
// numa área quadrada com a máscara circular; dá para arrastar (mouse ou
// dedo), dar zoom pela barra, pela rodinha do mouse, pelo gesto de pinça
// ou pelo teclado (setas movem, + e - dão zoom).
//
// Sem biblioteca: tudo com Pointer Events (o mesmo código atende mouse,
// toque e caneta) e um canvas no final (lib/perfil/imagem.ts).
//
// O estado guarda o PONTO DA IMAGEM que está no centro da área e o zoom
// (1 = o lado menor da foto preenche a área). Assim o recorte não depende
// do tamanho da tela: se a janela mudar de tamanho, nada sai do lugar.
import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoPonteiro } from "react";
import type { AreaRecorte } from "@/lib/perfil/imagem";
import { BOTAO, BOTAO_SECUNDARIO } from "@/components/ui";

const ZOOM_MAX = 4;

interface Estado {
  zoom: number;
  cx: number;
  cy: number;
}

export default function RecorteFoto({
  imagem,
  onCancelar,
  onConfirmar,
}: {
  imagem: HTMLImageElement;
  onCancelar: () => void;
  onConfirmar: (area: AreaRecorte) => void;
}) {
  const largura = imagem.naturalWidth;
  const altura = imagem.naturalHeight;
  const menor = Math.min(largura, altura);

  const areaRef = useRef<HTMLDivElement>(null);
  const [lado, setLado] = useState(0); // tamanho da área na tela, em px
  const [estado, setEstadoBruto] = useState<Estado>({ zoom: 1, cx: largura / 2, cy: altura / 2 });
  const estadoRef = useRef(estado);
  const ladoRef = useRef(lado);
  const ponteiros = useRef(new Map<number, { x: number; y: number }>());

  // Mantém o recorte sempre dentro da foto (sem sobrar fundo vazio).
  const limitar = useCallback(
    (e: Estado): Estado => {
      const zoom = Math.min(ZOOM_MAX, Math.max(1, e.zoom));
      const metade = menor / zoom / 2;
      return {
        zoom,
        cx: Math.min(largura - metade, Math.max(metade, e.cx)),
        cy: Math.min(altura - metade, Math.max(metade, e.cy)),
      };
    },
    [largura, altura, menor],
  );

  const setEstado = useCallback(
    (proximo: (atual: Estado) => Estado) => {
      const novo = limitar(proximo(estadoRef.current));
      estadoRef.current = novo;
      setEstadoBruto(novo);
    },
    [limitar],
  );

  const mover = useCallback(
    (dx: number, dy: number) => {
      setEstado((e) => {
        const escala = (ladoRef.current / menor) * e.zoom;
        return { ...e, cx: e.cx - dx / escala, cy: e.cy - dy / escala };
      });
    },
    [setEstado, menor],
  );

  // Zoom mantendo parado o ponto que está sob o dedo/cursor (px, py:
  // posição na área, em px de tela). Sem ponto, usa o centro.
  const zoomEm = useCallback(
    (novoZoom: number, px?: number, py?: number) => {
      setEstado((e) => {
        const l = ladoRef.current;
        const ox = (px ?? l / 2) - l / 2;
        const oy = (py ?? l / 2) - l / 2;
        const antes = (l / menor) * e.zoom;
        const z = Math.min(ZOOM_MAX, Math.max(1, novoZoom));
        const depois = (l / menor) * z;
        const ix = e.cx + ox / antes;
        const iy = e.cy + oy / antes;
        return { zoom: z, cx: ix - ox / depois, cy: iy - oy / depois };
      });
    },
    [setEstado, menor],
  );

  // Mede a área (muda ao girar o celular ou redimensionar a janela).
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const medir = () => {
      ladoRef.current = el.clientWidth;
      setLado(el.clientWidth);
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Rodinha do mouse / pinça do touchpad. Precisa de "passive: false" para
  // não rolar a página junto.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const roda = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      const fator = Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.002));
      zoomEm(estadoRef.current.zoom * fator, ev.clientX - r.left, ev.clientY - r.top);
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, [zoomEm]);

  // Janela aberta: trava a rolagem da página, põe o foco na área e fecha
  // com Esc. Roda uma vez só (o ref evita reinstalar a cada render, o que
  // tiraria o foco da barra de zoom).
  const cancelarRef = useRef(onCancelar);
  useEffect(() => {
    cancelarRef.current = onCancelar;
  }, [onCancelar]);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    areaRef.current?.focus();
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") cancelarRef.current();
    };
    window.addEventListener("keydown", tecla);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", tecla);
    };
  }, []);

  // Arrastar e pinça ---------------------------------------------------
  function aoPressionar(ev: EventoPonteiro<HTMLDivElement>) {
    ev.currentTarget.setPointerCapture(ev.pointerId);
    ponteiros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  }

  function aoMover(ev: EventoPonteiro<HTMLDivElement>) {
    const lista = ponteiros.current;
    const anterior = lista.get(ev.pointerId);
    if (!anterior) return;

    if (lista.size === 1) {
      mover(ev.clientX - anterior.x, ev.clientY - anterior.y);
      lista.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      return;
    }

    // Dois dedos: a distância entre eles dá o zoom e o ponto do meio
    // arrasta a foto junto.
    const outro = [...lista.entries()].find(([id]) => id !== ev.pointerId)?.[1];
    if (!outro) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const distAntes = Math.hypot(anterior.x - outro.x, anterior.y - outro.y);
    const distDepois = Math.hypot(ev.clientX - outro.x, ev.clientY - outro.y);
    const meioAntes = { x: (anterior.x + outro.x) / 2, y: (anterior.y + outro.y) / 2 };
    const meioDepois = { x: (ev.clientX + outro.x) / 2, y: (ev.clientY + outro.y) / 2 };
    if (distAntes > 0) {
      zoomEm(estadoRef.current.zoom * (distDepois / distAntes), meioAntes.x - r.left, meioAntes.y - r.top);
    }
    mover(meioDepois.x - meioAntes.x, meioDepois.y - meioAntes.y);
    lista.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  }

  function aoSoltar(ev: EventoPonteiro<HTMLDivElement>) {
    ponteiros.current.delete(ev.pointerId);
  }

  function aoTeclar(ev: React.KeyboardEvent<HTMLDivElement>) {
    const passo = ev.shiftKey ? 40 : 10;
    const acoes: Record<string, () => void> = {
      ArrowLeft: () => mover(passo, 0),
      ArrowRight: () => mover(-passo, 0),
      ArrowUp: () => mover(0, passo),
      ArrowDown: () => mover(0, -passo),
      "+": () => zoomEm(estadoRef.current.zoom * 1.1),
      "=": () => zoomEm(estadoRef.current.zoom * 1.1),
      "-": () => zoomEm(estadoRef.current.zoom / 1.1),
    };
    const acao = acoes[ev.key];
    if (acao) {
      ev.preventDefault();
      acao();
    }
  }

  function confirmar() {
    const { zoom, cx, cy } = estadoRef.current;
    const ladoRecorte = menor / zoom;
    onConfirmar({
      x: Math.max(0, Math.min(largura - ladoRecorte, cx - ladoRecorte / 2)),
      y: Math.max(0, Math.min(altura - ladoRecorte, cy - ladoRecorte / 2)),
      lado: ladoRecorte,
    });
  }

  // Quantos px de tela cada px da imagem ocupa agora.
  const escala = (lado / menor) * estado.zoom;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 sm:items-center sm:p-6"
      onClick={(ev) => ev.target === ev.currentTarget && onCancelar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-recorte"
        className="max-h-dvh w-full pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-w-md overflow-y-auto overscroll-contain rounded-t-lg bg-surface p-5 shadow-cartao sm:rounded-lg sm:p-6 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <h2 id="titulo-recorte" className="text-lg font-bold text-ink">
          Ajustar foto
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          Arraste para posicionar. Use a barra ou dois dedos para aproximar.
        </p>

        <div
          ref={areaRef}
          tabIndex={0}
          role="application"
          aria-label="Área de recorte. Use as setas para mover e + ou - para o zoom."
          onPointerDown={aoPressionar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
          onKeyDown={aoTeclar}
          className="relative mx-auto mt-4 aspect-square w-full max-w-[min(360px,calc(100dvh-21rem))] cursor-grab touch-none overflow-hidden rounded-md bg-ink select-none active:cursor-grabbing"
        >
          {lado > 0 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagem.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
              style={{
                width: largura,
                height: altura,
                transform: `translate3d(${lado / 2 - estado.cx * escala}px, ${lado / 2 - estado.cy * escala}px, 0) scale(${escala})`,
              }}
            />
          )}
          {/* Máscara: escurece tudo fora do círculo. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/90"
            style={{ boxShadow: "0 0 0 9999px rgba(23, 32, 51, 0.6)" }}
          />
        </div>

        <div className="mt-5 flex items-center gap-3">
          <span aria-hidden="true" className="text-lg font-bold text-muted">
            −
          </span>
          <label htmlFor="zoom-foto" className="sr-only">
            Zoom
          </label>
          <input
            id="zoom-foto"
            type="range"
            min={1}
            max={ZOOM_MAX}
            step={0.01}
            value={estado.zoom}
            onChange={(ev) => zoomEm(Number(ev.target.value))}
            className="h-11 w-full cursor-pointer accent-primary"
          />
          <span aria-hidden="true" className="text-lg font-bold text-muted">
            +
          </span>
        </div>

        <div className="mt-4 flex gap-2 sm:justify-end">
          <button type="button" onClick={onCancelar} className={`${BOTAO_SECUNDARIO} flex-1 sm:flex-none`}>
            Cancelar
          </button>
          <button type="button" onClick={confirmar} className={`${BOTAO} flex-1 sm:flex-none`}>
            Usar esta foto
          </button>
        </div>
      </div>
    </div>
  );
}
