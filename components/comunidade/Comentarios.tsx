"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { ALERTA_ERRO, CAMPO } from "@/components/ui";
import { COMENTARIO_MAX } from "@/lib/comunidade/regras";
import type { Comentario } from "@/lib/comunidade/tipos";
import { chamarApi } from "./api";
import { useComunidade } from "./Contexto";
import { Cabecalho, JanelaDenuncia, MenuAcoes } from "./Pecas";

// Comentários de um post: um nível só (sem resposta de resposta), até
// 300 caracteres. Carrega quando o usuário abre.
export default function Comentarios({
  postId,
  onTotal,
}: {
  postId: number;
  // Soma (ou subtrai) do contador que aparece no botão "Comentar".
  onTotal: (delta: number) => void;
}) {
  const { estado, executar } = useComunidade();
  const campo = useId();
  const [lista, setLista] = useState<Comentario[] | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [denuncia, setDenuncia] = useState<number | null>(null);

  async function carregar(cursor?: number) {
    setCarregando(true);
    const r = await chamarApi<{ comentarios: Comentario[]; temMais: boolean }>(
      `/api/comunidade/posts/${postId}/comentarios${cursor ? `?cursor=${cursor}` : ""}`,
    );
    setCarregando(false);
    if (!r.ok || !r.dados) {
      setErro(r.erro);
      setLista((l) => l ?? []);
      return;
    }
    const novos = r.dados.comentarios;
    setLista((l) => {
      const vistos = new Set((l ?? []).map((c) => c.id));
      return [...(l ?? []), ...novos.filter((c) => !vistos.has(c.id))];
    });
    setTemMais(r.dados.temMais);
  }

  useEffect(() => {
    // Primeira carga ao abrir os comentários deste post.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const limpo = texto.trim();
    if (!limpo) return setErro("Escreva o comentário.");
    if ([...limpo].length > COMENTARIO_MAX) return setErro(`O comentário pode ter no máximo ${COMENTARIO_MAX} caracteres.`);
    setErro(null);
    setEnviando(true);
    const r = await executar(() =>
      chamarApi<{ comentario: Comentario }>(`/api/comunidade/posts/${postId}/comentarios`, "POST", { texto: limpo }),
    );
    setEnviando(false);
    if (!r.ok || !r.dados) return setErro(r.erro);
    const novo = r.dados.comentario;
    setLista((l) => [...(l ?? []), novo]);
    setTexto("");
    onTotal(1);
  }

  async function apagar(id: number) {
    if (!window.confirm("Apagar este comentário? Não dá para desfazer.")) return;
    const r = await chamarApi(`/api/comunidade/comentarios/${id}`, "DELETE");
    if (!r.ok) return setErro(r.erro);
    setLista((l) => (l ?? []).filter((c) => c.id !== id));
    onTotal(-1);
  }

  const tamanho = [...texto].length;
  const podeComentar = !!estado && !estado.suspenso;

  return (
    <section aria-label="Comentários" className="mt-3 border-t border-line-2 pt-3">
      {lista === null ? (
        <p className="py-2 text-sm text-muted" role="status">
          Carregando comentários…
        </p>
      ) : (
        <>
          {lista.length === 0 && <p className="py-1 text-sm text-muted">Nenhum comentário ainda. Seja o primeiro!</p>}
          <ul className="space-y-3">
            {lista.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Cabecalho autor={c.autor} criadoEm={c.criado_em} tamanho={32} />
                  <p className="mt-1 whitespace-pre-wrap break-words pl-11 text-sm text-campo">{c.texto}</p>
                </div>
                <MenuAcoes
                  rotulo="Ações do comentário"
                  podeApagar={c.pode_apagar}
                  podeDenunciar={!c.sou_autor}
                  onApagar={() => apagar(c.id)}
                  onDenunciar={() => setDenuncia(c.id)}
                />
              </li>
            ))}
          </ul>
          {temMais && (
            <button
              type="button"
              onClick={() => carregar(lista[lista.length - 1]?.id)}
              disabled={carregando}
              className="mt-2 min-h-11 text-sm font-semibold text-destaque hover:underline disabled:opacity-60"
            >
              {carregando ? "Carregando…" : "Ver mais comentários"}
            </button>
          )}
        </>
      )}

      {podeComentar && (
        <form onSubmit={enviar} className="mt-3">
          <label htmlFor={`${campo}-novo`} className="sr-only">
            Escreva um comentário
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id={`${campo}-novo`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={COMENTARIO_MAX + 20}
              rows={1}
              placeholder="Escreva um comentário…"
              className={`${CAMPO} min-h-11 resize-y py-2.5`}
            />
            <button
              type="submit"
              disabled={enviando}
              className="min-h-11 shrink-0 border border-line-strong px-4 font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-campo transition hover:border-ink-2 hover:text-ink disabled:opacity-60"
            >
              {enviando ? "…" : "Enviar"}
            </button>
          </div>
          <p className={`mt-1 text-right text-xs tabular-nums ${tamanho > COMENTARIO_MAX ? "text-danger" : "text-muted"}`}>
            {tamanho}/{COMENTARIO_MAX}
          </p>
        </form>
      )}

      {erro && (
        <p role="alert" className={`${ALERTA_ERRO} mt-2`}>
          {erro}
        </p>
      )}

      {denuncia !== null && <JanelaDenuncia tipo="comentario" id={denuncia} onFechar={() => setDenuncia(null)} />}
    </section>
  );
}
