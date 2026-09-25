"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Avatar from "@/components/Avatar";
import { IconeBandeira, IconeLixeira, IconeMais } from "@/components/Icones";
import { ALERTA_ERRO, ALERTA_SUCESSO, BOTAO, BOTAO_SECUNDARIO, CAMPO } from "@/components/ui";
import { CATEGORIAS, DETALHE_DENUNCIA_MAX, MOTIVOS_DENUNCIA, type MotivoDenuncia } from "@/lib/comunidade/regras";
import { urlAvatar, urlImagem, type Autor, type Conteudo } from "@/lib/comunidade/tipos";
import { chamarApi, dataHoraCompleta, tempoRelativo } from "./api";
import { useComunidade } from "./Contexto";
import Janela from "./Janela";

// Peças pequenas usadas no cartão do post e nos comentários.

export function linkPerfil(apelido: string | null) {
  return apelido ? `/painel/comunidade/u/${encodeURIComponent(apelido)}` : null;
}

// Avatar + apelido + "há 5 min". No link público (somente leitura) o
// apelido não vira link, porque o perfil fica dentro do painel.
export function Cabecalho({
  autor,
  criadoEm,
  categoria,
  tamanho = 40,
}: {
  autor: Autor;
  criadoEm: string;
  categoria?: Conteudo["categoria"];
  tamanho?: number;
}) {
  const { somenteLeitura } = useComunidade();
  const href = somenteLeitura ? null : linkPerfil(autor.apelido);
  const nome = autor.apelido ?? "Usuário";
  const avatar = (
    <Avatar fotoUrl={urlAvatar(autor.foto_path)} avatarPronto={autor.avatar_pronto} apelido={nome} tamanho={tamanho} />
  );
  return (
    <div className="flex min-w-0 items-center gap-3">
      {href ? (
        <Link href={href} tabIndex={-1} aria-hidden="true" className="shrink-0">
          {avatar}
        </Link>
      ) : (
        avatar
      )}
      <div className="min-w-0">
        {href ? (
          <Link href={href} className="block truncate font-semibold text-ink hover:underline">
            {nome}
          </Link>
        ) : (
          <span className="block truncate font-semibold text-ink">{nome}</span>
        )}
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <time dateTime={criadoEm} title={dataHoraCompleta(criadoEm)} suppressHydrationWarning>
            {tempoRelativo(criadoEm)}
          </time>
          {categoria && (
            <span className="border border-line-strong px-1.5 py-px font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-2">
              {CATEGORIAS[categoria]}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// Texto, imagens e link do post.
export function Corpo({ conteudo }: { conteudo: Conteudo }) {
  return (
    <>
      {conteudo.texto && (
        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-campo">{conteudo.texto}</p>
      )}
      <Imagens imagens={conteudo.imagens} apelido={conteudo.autor.apelido} />
      {conteudo.link_url && <PreviaLink url={conteudo.link_url} previa={conteudo.link_previa} />}
    </>
  );
}

function Imagens({ imagens, apelido }: { imagens: string[]; apelido: string | null }) {
  if (!imagens.length) return null;
  const uma = imagens.length === 1;
  return (
    <ul className={`mt-3 grid gap-1 ${uma ? "grid-cols-1" : "grid-cols-2"}`}>
      {imagens.map((path, i) => {
        const url = urlImagem(path);
        if (!url) return null;
        return (
          <li
            key={path}
            className={`overflow-hidden border border-line bg-canvas ${
              imagens.length === 3 && i === 0 ? "col-span-2" : ""
            }`}
          >
            <a href={url} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Imagem ${i + 1} do post de ${apelido ?? "um usuário"}`}
                loading="lazy"
                decoding="async"
                className={`w-full object-cover ${uma ? "max-h-[28rem]" : "aspect-square"} ${
                  imagens.length === 3 && i === 0 ? "aspect-[2/1]!" : ""
                }`}
              />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function PreviaLink({ url, previa }: { url: string; previa: Conteudo["link_previa"] }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Link estranho: mostra como veio.
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className="mt-3 block border border-line bg-canvas px-4 py-3 transition hover:border-line-strong"
    >
      <span className="block truncate font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-destaque">
        {previa?.site ?? host}
      </span>
      <span className="mt-0.5 block break-words font-semibold text-ink">{previa?.titulo ?? url}</span>
      {previa?.descricao && <span className="mt-0.5 line-clamp-2 block text-sm text-ink-2">{previa.descricao}</span>}
    </a>
  );
}

// Menu "…" com Apagar e/ou Denunciar.
export function MenuAcoes({
  rotulo,
  podeApagar,
  podeDenunciar,
  onApagar,
  onDenunciar,
}: {
  rotulo: string;
  podeApagar: boolean;
  podeDenunciar: boolean;
  onApagar: () => void;
  onDenunciar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!aberto) return;
    function fora(e: PointerEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  if (!podeApagar && !podeDenunciar) return null;
  const item = "flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm font-semibold transition hover:bg-realce-2";

  return (
    <div ref={caixa} className="relative shrink-0">
      <button
        type="button"
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((v) => !v)}
        className="-mr-2 flex min-h-11 min-w-11 items-center justify-center text-ink-2 transition hover:text-ink"
      >
        <IconeMais />
      </button>
      {aberto && (
        <div
          id={id}
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-48 border border-line-strong bg-surface py-1 shadow-[0_12px_32px_var(--color-sombra)]"
        >
          {podeDenunciar && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAberto(false);
                onDenunciar();
              }}
              className={`${item} text-ink-2 hover:text-ink`}
            >
              <IconeBandeira width={18} height={18} />
              Denunciar
            </button>
          )}
          {podeApagar && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAberto(false);
                onApagar();
              }}
              className={`${item} text-danger`}
            >
              <IconeLixeira width={18} height={18} />
              Apagar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function JanelaDenuncia({
  tipo,
  id,
  onFechar,
}: {
  tipo: "post" | "comentario";
  id: number;
  onFechar: () => void;
}) {
  const campo = useId();
  const [motivo, setMotivo] = useState<MotivoDenuncia | null>(null);
  const [detalhe, setDetalhe] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!motivo) return setErro("Escolha o motivo.");
    setErro(null);
    setEnviando(true);
    const r = await chamarApi("/api/comunidade/denunciar", "POST", { tipo, id, motivo, detalhe: detalhe.trim() });
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    setFeito(true);
  }

  return (
    <Janela titulo={tipo === "post" ? "Denunciar post" : "Denunciar comentário"} onFechar={onFechar} travada={enviando}>
      {feito ? (
        <div className="space-y-4">
          <p role="status" className={ALERTA_SUCESSO}>
            Denúncia enviada. A moderação vai analisar. Obrigado por ajudar a cuidar da comunidade!
          </p>
          <button type="button" onClick={onFechar} className={`${BOTAO_SECUNDARIO} w-full sm:w-auto`}>
            Fechar
          </button>
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-campo">Qual o problema?</legend>
            <div className="space-y-1">
              {(Object.keys(MOTIVOS_DENUNCIA) as MotivoDenuncia[]).map((m) => (
                <label
                  key={m}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 border px-3 text-sm transition ${
                    motivo === m ? "border-destaque bg-primary-soft text-ink" : "border-line text-ink-2 hover:text-ink"
                  }`}
                >
                  <input
                    type="radio"
                    name={`${campo}-motivo`}
                    value={m}
                    checked={motivo === m}
                    onChange={() => setMotivo(m)}
                    className="accent-destaque"
                  />
                  {MOTIVOS_DENUNCIA[m]}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor={`${campo}-detalhe`} className="mb-1.5 block text-sm font-semibold text-campo">
              Detalhe <span className="font-normal text-muted">(opcional)</span>
            </label>
            <textarea
              id={`${campo}-detalhe`}
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
              maxLength={DETALHE_DENUNCIA_MAX}
              rows={3}
              className={`${CAMPO} resize-y`}
            />
          </div>
          {erro && (
            <p role="alert" className={ALERTA_ERRO}>
              {erro}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onFechar} disabled={enviando} className={BOTAO_SECUNDARIO}>
              Cancelar
            </button>
            <button type="submit" disabled={enviando} className={BOTAO}>
              {enviando ? "Enviando…" : "Enviar denúncia"}
            </button>
          </div>
        </form>
      )}
    </Janela>
  );
}
