"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import {
  IconeComentar,
  IconeCompartilhar,
  IconeCurtir,
  IconeRepublicar,
} from "@/components/Icones";
import { ALERTA_ERRO, BOTAO, BOTAO_SECUNDARIO, CAMPO, CARTAO } from "@/components/ui";
import { TEXTO_MAX } from "@/lib/comunidade/regras";
import { linkPublicoPost, type Post } from "@/lib/comunidade/tipos";
import { chamarApi } from "./api";
import Comentarios from "./Comentarios";
import { useComunidade } from "./Contexto";
import Janela from "./Janela";
import { Cabecalho, Corpo, JanelaDenuncia, MenuAcoes, linkPerfil } from "./Pecas";

export default function CartaoPost({
  post,
  onApagado,
  onRepublicado,
  comentariosAbertos = false,
}: {
  post: Post;
  onApagado?: (id: number) => void;
  onRepublicado?: (post: Post) => void;
  comentariosAbertos?: boolean;
}) {
  const { estado, somenteLeitura, executar, mostrarConvite } = useComunidade();
  const [curtidas, setCurtidas] = useState(post.curtidas);
  const [euCurti, setEuCurti] = useState(!!post.eu_curti);
  const [comentarios, setComentarios] = useState(post.comentarios);
  const [reposts, setReposts] = useState(post.reposts);
  const [euRepostei, setEuRepostei] = useState(!!post.eu_repostei);
  const [abertos, setAbertos] = useState(comentariosAbertos);
  const [republicando, setRepublicando] = useState(false);
  const [denunciando, setDenunciando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const repost = post.tipo === "repost";
  const original = repost ? post.original : post;
  // Autor do conteúdo que seria republicado (não dá para republicar o próprio).
  const originalEhMeu = !!original && !!estado?.apelido && original.autor.apelido === estado.apelido;

  async function curtir() {
    setErro(null);
    const antes = { euCurti, curtidas };
    setEuCurti(!euCurti);
    setCurtidas((n) => n + (euCurti ? -1 : 1));
    const r = await executar(() =>
      chamarApi<{ curtidas: number; eu_curti: boolean }>(`/api/comunidade/posts/${post.id}/curtir`, "POST", {
        curtir: !antes.euCurti,
      }),
    );
    if (!r.ok || !r.dados) {
      setEuCurti(antes.euCurti);
      setCurtidas(antes.curtidas);
      if (r.erro) setErro(r.erro);
      return;
    }
    setCurtidas(r.dados.curtidas);
    setEuCurti(r.dados.eu_curti);
  }

  function abrirRepublicar() {
    setErro(null);
    if (!estado?.acesso_total) {
      mostrarConvite("Republicar é dos planos Solo e Pro.");
      return;
    }
    if (!original) return setErro("O post original não está mais disponível.");
    if (originalEhMeu) return setErro("Você não pode republicar o próprio post.");
    if (euRepostei) return setErro("Você já republicou esse post.");
    setRepublicando(true);
  }

  async function compartilhar() {
    const url = linkPublicoPost(window.location.origin, post.id);
    const titulo = `Post de ${post.autor.apelido ?? "um usuário"} na Comunidade Ártemis`;
    try {
      if (navigator.share) {
        await navigator.share({ title: titulo, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setAviso("Link copiado!");
    } catch (e) {
      // Cancelar o menu de compartilhar do celular não é erro.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setAviso(url);
    }
    setTimeout(() => setAviso(null), 4000);
  }

  async function apagar() {
    if (!window.confirm("Apagar este post? Não dá para desfazer.")) return;
    setErro(null);
    const r = await chamarApi(`/api/comunidade/posts/${post.id}`, "DELETE");
    if (!r.ok) return setErro(r.erro);
    onApagado?.(post.id);
  }

  const acao =
    "flex min-h-11 items-center justify-center gap-1.5 text-sm font-semibold tabular-nums transition hover:text-ink disabled:opacity-60";

  return (
    <article className={`${CARTAO} p-4 sm:p-5`} aria-label={`Post de ${post.autor.apelido ?? "usuário"}`}>
      {repost && (
        <p className="-mt-1 mb-2 flex items-center gap-2 text-xs font-semibold text-ink-2">
          <IconeRepublicar width={16} height={16} />
          {somenteLeitura || !post.autor.apelido ? (
            <span>{post.autor.apelido ?? "Alguém"} republicou</span>
          ) : (
            <Link href={linkPerfil(post.autor.apelido) ?? "#"} className="hover:underline">
              {post.autor.apelido} republicou
            </Link>
          )}
        </p>
      )}

      <div className="flex items-start justify-between gap-2">
        <Cabecalho autor={post.autor} criadoEm={post.criado_em} categoria={repost ? null : post.categoria} />
        {!somenteLeitura && (
          <MenuAcoes
            rotulo="Ações do post"
            podeApagar={!!post.pode_apagar}
            podeDenunciar={!post.sou_autor}
            onApagar={apagar}
            onDenunciar={() => setDenunciando(true)}
          />
        )}
      </div>

      {repost ? (
        <>
          {post.texto && (
            <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-campo">{post.texto}</p>
          )}
          <div className="mt-3 border border-line bg-canvas/40 p-3 sm:p-4">
            {post.original ? (
              <>
                <Cabecalho
                  autor={post.original.autor}
                  criadoEm={post.original.criado_em}
                  categoria={post.original.categoria}
                  tamanho={32}
                />
                <Corpo conteudo={post.original} />
              </>
            ) : (
              <p className="text-sm text-muted">O post original não está mais disponível.</p>
            )}
          </div>
        </>
      ) : (
        <Corpo conteudo={post} />
      )}

      {post.removido && (
        <p className="mt-3 text-xs font-semibold text-danger">Este post foi removido pela moderação.</p>
      )}

      {somenteLeitura ? (
        <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-line-2 pt-3 text-sm text-ink-2">
          <span>{curtidas} curtidas</span>
          <span>{comentarios} comentários</span>
          <span>{reposts} republicações</span>
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-4 border-t border-line-2 pt-1 text-ink-2">
          <button
            type="button"
            onClick={curtir}
            aria-pressed={euCurti}
            aria-label={`${euCurti ? "Descurtir" : "Curtir"} (${curtidas})`}
            className={`${acao} ${euCurti ? "text-destaque" : ""}`}
          >
            <IconeCurtir fill={euCurti ? "currentColor" : "none"} />
            {curtidas > 0 && curtidas}
          </button>
          <button
            type="button"
            onClick={() => setAbertos((v) => !v)}
            aria-expanded={abertos}
            aria-label={`Comentários (${comentarios})`}
            className={`${acao} ${abertos ? "text-ink" : ""}`}
          >
            <IconeComentar />
            {comentarios > 0 && comentarios}
          </button>
          <button
            type="button"
            onClick={abrirRepublicar}
            aria-label={`Republicar (${reposts})`}
            className={`${acao} ${euRepostei ? "text-destaque" : ""}`}
          >
            <IconeRepublicar />
            {reposts > 0 && reposts}
          </button>
          <button type="button" onClick={compartilhar} aria-label="Compartilhar" className={acao}>
            <IconeCompartilhar />
          </button>
        </div>
      )}

      {aviso && (
        <p role="status" className="mt-2 break-all text-center text-xs font-semibold text-ink">
          {aviso}
        </p>
      )}
      {erro && (
        <p role="alert" className={`${ALERTA_ERRO} mt-2`}>
          {erro}
        </p>
      )}

      {abertos && !somenteLeitura && (
        <Comentarios postId={post.id} onTotal={(d) => setComentarios((n) => Math.max(0, n + d))} />
      )}

      {republicando && original && (
        <JanelaRepublicar
          postId={post.id}
          autor={original.autor.apelido}
          trecho={original.texto}
          onFechar={() => setRepublicando(false)}
          onFeito={(novo) => {
            setRepublicando(false);
            setEuRepostei(true);
            if (!repost) setReposts((n) => n + 1);
            onRepublicado?.(novo);
          }}
        />
      )}
      {denunciando && <JanelaDenuncia tipo="post" id={post.id} onFechar={() => setDenunciando(false)} />}
    </article>
  );
}

// Republicar direto (sem texto) ou com um comentário próprio.
function JanelaRepublicar({
  postId,
  autor,
  trecho,
  onFechar,
  onFeito,
}: {
  postId: number;
  autor: string | null;
  trecho: string;
  onFechar: () => void;
  onFeito: (post: Post) => void;
}) {
  const { executar } = useComunidade();
  const campo = useId();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const limpo = texto.trim();
    if ([...limpo].length > TEXTO_MAX) return setErro(`O comentário pode ter no máximo ${TEXTO_MAX} caracteres.`);
    setErro(null);
    setEnviando(true);
    const r = await executar(() =>
      chamarApi<{ post: Post }>(`/api/comunidade/posts/${postId}/republicar`, "POST", { texto: limpo }),
    );
    setEnviando(false);
    if (!r.ok || !r.dados) {
      if (r.erro) setErro(r.erro);
      else if (r.codigo === "assinar") onFechar();
      return;
    }
    onFeito(r.dados.post);
  }

  const tamanho = [...texto].length;

  return (
    <Janela titulo="Republicar" onFechar={onFechar} travada={enviando}>
      <form onSubmit={enviar} className="space-y-4">
        <div className="border border-line bg-canvas px-3 py-2 text-sm text-ink-2">
          <strong className="text-ink">{autor ?? "Post"}</strong>
          {trecho && <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words">{trecho}</p>}
        </div>
        <div>
          <label htmlFor={`${campo}-texto`} className="mb-1.5 block text-sm font-semibold text-campo">
            Seu comentário <span className="font-normal text-muted">(opcional)</span>
          </label>
          <textarea
            id={`${campo}-texto`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={TEXTO_MAX + 50}
            rows={3}
            placeholder="Deixe em branco para republicar direto"
            className={`${CAMPO} resize-y`}
          />
          <p className={`mt-1 text-right text-xs tabular-nums ${tamanho > TEXTO_MAX ? "text-danger" : "text-muted"}`}>
            {tamanho}/{TEXTO_MAX}
          </p>
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
            {enviando ? "Republicando…" : texto.trim() ? "Republicar com comentário" : "Republicar"}
          </button>
        </div>
      </form>
    </Janela>
  );
}
