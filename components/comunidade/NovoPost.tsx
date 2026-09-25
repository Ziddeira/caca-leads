"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { IconeFechar, IconeImagem, IconeLink } from "@/components/Icones";
import { ALERTA_AVISO, ALERTA_ERRO, BOTAO, CAMPO, CARTAO } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  CATEGORIAS,
  COMUNIDADE_BUCKET,
  IMAGENS_MAX,
  TEXTO_MAX,
  linkValido,
  type Categoria,
} from "@/lib/comunidade/regras";
import { ErroImagem, caminhoImagem, conferirImagem, reduzirImagem } from "@/lib/comunidade/imagem";
import type { Post } from "@/lib/comunidade/tipos";
import { chamarApi, dataHoraCompleta } from "./api";
import { useComunidade } from "./Contexto";

interface Anexo {
  chave: string;
  arquivo: File;
  previa: string;
}

// Caixa de publicar, no topo do feed. Texto até 500 caracteres, até 4
// imagens (Solo/Pro), link opcional e categoria opcional.
export default function NovoPost({ onPublicado }: { onPublicado: (post: Post) => void }) {
  const { estado, userId, pedirRegras, mostrarConvite } = useComunidade();
  const id = useId();
  const seletor = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [comLink, setComLink] = useState(false);
  const [link, setLink] = useState("");
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [postsHoje, setPostsHoje] = useState(estado?.posts_hoje ?? 0);

  // Libera a memória das miniaturas ao sair da tela.
  const anexosAtuais = useRef(anexos);
  useEffect(() => {
    anexosAtuais.current = anexos;
  });
  useEffect(() => () => anexosAtuais.current.forEach((a) => URL.revokeObjectURL(a.previa)), []);

  if (!estado) return null;

  if (estado.suspenso) {
    return (
      <p role="status" className={ALERTA_AVISO}>
        {estado.suspenso_ate
          ? `Sua conta está suspensa da comunidade até ${dataHoraCompleta(estado.suspenso_ate)}. Você continua lendo o feed, mas não publica, comenta nem curte.`
          : "Sua conta foi suspensa da comunidade de forma definitiva. Você continua lendo o feed, mas não publica, comenta nem curte."}
      </p>
    );
  }

  const tamanho = [...texto].length;
  const gratis = !estado.acesso_total;

  function abrirImagens() {
    if (gratis) {
      mostrarConvite("Imagens nos posts são dos planos Solo e Pro.");
      return;
    }
    seletor.current?.click();
  }

  function escolher(lista: FileList | null) {
    setErro(null);
    if (!lista) return;
    const novos: Anexo[] = [];
    for (const arquivo of Array.from(lista)) {
      if (anexos.length + novos.length >= IMAGENS_MAX) {
        setErro(`Dá para anexar no máximo ${IMAGENS_MAX} imagens.`);
        break;
      }
      try {
        conferirImagem(arquivo);
        novos.push({ chave: `${arquivo.name}-${arquivo.size}-${Math.random()}`, arquivo, previa: URL.createObjectURL(arquivo) });
      } catch (e) {
        setErro(e instanceof ErroImagem ? e.message : "Não foi possível usar essa imagem.");
      }
    }
    setAnexos((a) => [...a, ...novos]);
    if (seletor.current) seletor.current.value = "";
  }

  function tirar(chave: string) {
    setAnexos((a) => {
      const sai = a.find((x) => x.chave === chave);
      if (sai) URL.revokeObjectURL(sai.previa);
      return a.filter((x) => x.chave !== chave);
    });
  }

  async function publicar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const limpo = texto.trim();
    const linkLimpo = comLink ? link.trim() : "";
    if (!limpo && !anexos.length) return setErro("Escreva algo ou anexe uma imagem.");
    if ([...limpo].length > TEXTO_MAX) return setErro(`O texto pode ter no máximo ${TEXTO_MAX} caracteres.`);
    if (linkLimpo && !linkValido(linkLimpo)) {
      return setErro("Link inválido. Use um endereço que comece com http:// ou https://.");
    }
    if (!(await pedirRegras())) return;

    const enviadas: string[] = [];
    const supabase = createClient();
    try {
      for (const [i, anexo] of anexos.entries()) {
        setEnviando(`Enviando imagem ${i + 1} de ${anexos.length}…`);
        const pronta = await reduzirImagem(anexo.arquivo);
        const caminho = caminhoImagem(userId ?? "", pronta.extensao);
        const { error } = await supabase.storage
          .from(COMUNIDADE_BUCKET)
          .upload(caminho, pronta.blob, { contentType: pronta.tipo, upsert: false });
        if (error) throw new ErroImagem("Não foi possível enviar uma das imagens. Tente de novo.");
        enviadas.push(caminho);
      }

      setEnviando("Publicando…");
      const r = await chamarApi<{ post: Post }>("/api/comunidade/posts", "POST", {
        texto: limpo,
        categoria,
        imagens: enviadas,
        link: linkLimpo || null,
      });
      if (!r.ok || !r.dados) {
        // O servidor já apagou as imagens enviadas.
        if (r.codigo === "assinar") mostrarConvite(r.erro ?? "Esse recurso é dos planos Solo e Pro.");
        else setErro(r.erro);
        return;
      }
      anexos.forEach((a) => URL.revokeObjectURL(a.previa));
      setTexto("");
      setCategoria(null);
      setLink("");
      setComLink(false);
      setAnexos([]);
      setPostsHoje((n) => n + 1);
      if (r.dados.post) onPublicado(r.dados.post);
    } catch (err) {
      if (enviadas.length) await supabase.storage.from(COMUNIDADE_BUCKET).remove(enviadas);
      setErro(err instanceof ErroImagem ? err.message : "Não foi possível publicar agora.");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <form onSubmit={publicar} className={`${CARTAO} p-4 sm:p-5`} aria-label="Nova publicação">
      <label htmlFor={`${id}-texto`} className="sr-only">
        Escreva sua publicação
      </label>
      <textarea
        id={`${id}-texto`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={TEXTO_MAX + 50}
        rows={3}
        placeholder="Compartilhe um layout, uma ferramenta, uma dúvida ou uma conquista…"
        className={`${CAMPO} min-h-24 resize-y`}
      />
      <p className={`mt-1 text-right text-xs tabular-nums ${tamanho > TEXTO_MAX ? "text-danger" : "text-muted"}`}>
        {tamanho}/{TEXTO_MAX}
      </p>

      {anexos.length > 0 && (
        <ul className="mt-2 grid grid-cols-4 gap-2">
          {anexos.map((a) => (
            <li key={a.chave} className="relative aspect-square overflow-hidden border border-line bg-canvas">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.previa} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => tirar(a.chave)}
                disabled={!!enviando}
                aria-label="Tirar imagem"
                className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center bg-black/70 text-ink"
              >
                <IconeFechar width={16} height={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {comLink && (
        <div className="mt-3">
          <label htmlFor={`${id}-link`} className="sr-only">
            Link
          </label>
          <input
            id={`${id}-link`}
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…"
            className={CAMPO}
          />
        </div>
      )}

      <fieldset className="mt-3">
        <legend className="sr-only">Categoria (opcional)</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CATEGORIAS) as Categoria[]).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={categoria === c}
              onClick={() => setCategoria((atual) => (atual === c ? null : c))}
              className={`min-h-11 border px-3 font-display text-xs font-semibold uppercase tracking-[0.08em] transition ${
                categoria === c
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-line-strong text-ink-2 hover:text-ink"
              }`}
            >
              {CATEGORIAS[c]}
            </button>
          ))}
        </div>
      </fieldset>

      <input
        ref={seletor}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => escolher(e.target.files)}
      />

      {erro && (
        <p role="alert" className={`${ALERTA_ERRO} mt-3`}>
          {erro}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line-2 pt-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={abrirImagens}
            disabled={!!enviando || anexos.length >= IMAGENS_MAX}
            className="flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-ink-2 transition hover:text-ink disabled:opacity-50"
          >
            <IconeImagem />
            Imagem
            {gratis && (
              <span className="border border-primary px-1.5 py-0.5 font-display text-[10px] uppercase tracking-[0.1em] text-primary">
                Solo/Pro
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setComLink((v) => !v)}
            aria-pressed={comLink}
            disabled={!!enviando}
            className={`flex min-h-11 items-center gap-2 px-2 text-sm font-semibold transition hover:text-ink ${
              comLink ? "text-primary" : "text-ink-2"
            }`}
          >
            <IconeLink />
            Link
          </button>
        </div>
        <button type="submit" disabled={!!enviando} className={`${BOTAO} w-full sm:w-auto`}>
          {enviando ?? "Publicar"}
        </button>
      </div>

      {gratis && (
        <p className="mt-3 text-xs text-muted">
          Plano Grátis: {postsHoje >= estado.limite_posts ? "você já publicou hoje" : "1 post por dia"}, sem
          imagens. Curtir e comentar são à vontade.{" "}
          <Link href="/painel/plano" className="font-semibold text-primary underline-offset-2 hover:underline">
            Ver planos
          </Link>
        </p>
      )}
    </form>
  );
}
