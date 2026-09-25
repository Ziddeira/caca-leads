"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { IconeBandeira } from "@/components/Icones";
import { ALERTA_ERRO, BOTAO_NEUTRO, CAMPO, CARTAO, EstadoVazio } from "@/components/ui";
import { MOTIVOS_DENUNCIA, MOTIVO_MODERACAO_MAX, ehMotivoDenuncia } from "@/lib/comunidade/regras";
import { urlImagem } from "@/lib/comunidade/tipos";
import { dataHoraCompleta } from "@/components/comunidade/api";

// (../comum.tsx é só do servidor; aqui ficam as versões do navegador.)
function dataHora(iso: string | null) {
  return iso ? dataHoraCompleta(iso) : "—";
}

export interface GrupoDenuncia {
  alvo_tipo: "post" | "comentario";
  alvo_id: number;
  post_id: number | null;
  trecho: string | null;
  total: number;
  primeira_em: string;
  ultima_em: string;
  decisao: string | null;
  decidida_em: string | null;
  decidida_por: string | null;
  denuncias: { motivo: string; detalhe: string | null; denunciante: string | null; criado_em: string }[];
  autor: { id: string; apelido: string | null; email: string | null; suspenso_ate: string | null } | null;
  conteudo: {
    tipo?: "post" | "repost";
    texto: string;
    imagens?: string[];
    link_url?: string | null;
    criado_em: string;
    removido_em: string | null;
    removido_motivo: string | null;
  } | null;
}

export interface Suspensao {
  user_id: string;
  apelido: string | null;
  email: string | null;
  ate: string | null;
  motivo: string;
  criado_em: string;
  criado_por: string | null;
}

const DECISOES: Record<string, string> = {
  removido: "Conteúdo removido pela moderação",
  mantido: "Denúncias descartadas (conteúdo mantido)",
  apagado: "Conteúdo apagado por um administrador",
  apagado_pelo_autor: "O próprio autor apagou o conteúdo",
};

const DURACOES = [
  { valor: "1", nome: "1 dia" },
  { valor: "3", nome: "3 dias" },
  { valor: "7", nome: "7 dias" },
  { valor: "30", nome: "30 dias" },
  { valor: "90", nome: "90 dias" },
  { valor: "definitiva", nome: "Definitiva" },
];

async function moderar(corpo: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/comunidade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    if (res.ok) return null;
    const dados = await res.json().catch(() => ({}));
    return dados.erro || "Não foi possível salvar agora.";
  } catch {
    return "Não foi possível falar com o servidor agora.";
  }
}

// "infinity" = definitiva (é como o banco devolve suspenso_ate).
function textoSuspensao(ate: string | null) {
  if (!ate) return null;
  return ate === "infinity" ? "Suspenso de forma definitiva" : `Suspenso até ${dataHora(ate)}`;
}

export default function ComunidadeAdminClient({
  grupos,
  suspensoes,
  pendentes,
}: {
  grupos: GrupoDenuncia[];
  suspensoes: Suspensao[];
  pendentes: boolean;
}) {
  return (
    <>
      {grupos.length === 0 ? (
        <EstadoVazio
          icone={<IconeBandeira width={26} height={26} />}
          titulo={pendentes ? "Nenhuma denúncia pendente" : "Nada por aqui"}
          texto={pendentes ? "A comunidade está tranquila." : "Nenhuma denúncia neste filtro."}
        />
      ) : (
        <ul className="space-y-4">
          {grupos.map((g) => (
            <li key={`${g.alvo_tipo}-${g.alvo_id}`}>
              <CartaoDenuncia grupo={g} pendente={pendentes} />
            </li>
          ))}
        </ul>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-bold text-ink">Suspensões ativas</h2>
        <p className="mt-0.5 mb-3 text-sm text-ink-2">
          Quem está suspenso lê o feed, mas não publica, comenta, curte nem denuncia.
        </p>
        {suspensoes.length === 0 ? (
          <p className="text-sm text-ink-2">Ninguém suspenso agora.</p>
        ) : (
          <ul className="space-y-3">
            {suspensoes.map((s) => (
              <li key={s.user_id}>
                <CartaoSuspensao suspensao={s} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function CartaoDenuncia({ grupo: g, pendente }: { grupo: GrupoDenuncia; pendente: boolean }) {
  const router = useRouter();
  const id = useId();
  const [motivo, setMotivo] = useState("");
  const [duracao, setDuracao] = useState("7");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const c = g.conteudo;
  const removido = !!c?.removido_em;
  const contagem = g.denuncias.reduce<Record<string, number>>((acc, d) => {
    acc[d.motivo] = (acc[d.motivo] ?? 0) + 1;
    return acc;
  }, {});
  const suspenso = textoSuspensao(g.autor?.suspenso_ate ?? null);

  async function agir(corpo: Record<string, unknown>, confirmacao: string) {
    if (!window.confirm(confirmacao)) return;
    setErro(null);
    setEnviando(true);
    const falha = await moderar(corpo);
    setEnviando(false);
    if (falha) return setErro(falha);
    setMotivo("");
    router.refresh();
  }

  function remover() {
    if (!motivo.trim()) return setErro("Escreva o motivo (o autor recebe no sino).");
    void agir(
      { acao: "remover", tipo: g.alvo_tipo, id: g.alvo_id, motivo },
      "Remover este conteúdo da comunidade? O autor será avisado.",
    );
  }

  function suspender() {
    if (!g.autor) return;
    if (!motivo.trim()) return setErro("Escreva o motivo (o autor recebe no sino).");
    const definitiva = duracao === "definitiva";
    void agir(
      { acao: "suspender", userId: g.autor.id, dias: definitiva ? null : Number(duracao), motivo },
      definitiva
        ? `Suspender ${g.autor.apelido ?? "este usuário"} da comunidade DE FORMA DEFINITIVA?`
        : `Suspender ${g.autor.apelido ?? "este usuário"} da comunidade por ${duracao} dia(s)?`,
    );
  }

  return (
    <article className={`${CARTAO} p-4 sm:p-5`}>
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <span className="border border-primary px-2 py-0.5 font-display text-xs font-semibold uppercase tracking-[0.1em] text-primary">
          {g.alvo_tipo === "post" ? (c?.tipo === "repost" ? "Republicação" : "Post") : "Comentário"} #{g.alvo_id}
        </span>
        <strong className="text-ink">
          {g.total} {g.total === 1 ? "denúncia" : "denúncias"}
        </strong>
        <span className="text-muted">
          · primeira {dataHora(g.primeira_em)}
          {g.total > 1 && ` · última ${dataHora(g.ultima_em)}`}
        </span>
      </header>

      <p className="mt-3 text-sm text-ink-2">
        Autor:{" "}
        {g.autor ? (
          <>
            <strong className="text-ink">{g.autor.apelido ?? "—"}</strong>{" "}
            <span className="break-all text-muted">({g.autor.email ?? "sem e-mail"})</span>
            {suspenso && <span className="ml-2 font-semibold text-danger">{suspenso}</span>}
          </>
        ) : (
          "conta apagada"
        )}
      </p>

      <div className="mt-3 border border-line bg-canvas p-3">
        {c ? (
          <>
            {c.texto ? (
              <p className="whitespace-pre-wrap break-words text-sm text-campo">{c.texto}</p>
            ) : (
              <p className="text-sm text-muted">(sem texto)</p>
            )}
            {!!c.imagens?.length && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {c.imagens.map((path) => {
                  const url = urlImagem(path);
                  return url ? (
                    <li key={path}>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Imagem do post denunciado" className="h-20 w-20 border border-line object-cover" />
                      </a>
                    </li>
                  ) : null;
                })}
              </ul>
            )}
            {c.link_url && <p className="mt-2 break-all text-xs text-ink-2">Link: {c.link_url}</p>}
            {removido && (
              <p className="mt-2 text-xs font-semibold text-danger">
                Removido em {dataHora(c.removido_em)}. Motivo: {c.removido_motivo}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">
            O conteúdo não existe mais. Trecho guardado na denúncia:{" "}
            <span className="whitespace-pre-wrap break-words text-campo">{g.trecho || "(sem texto)"}</span>
          </p>
        )}
      </div>
      {c && g.post_id && !removido && (
        <Link
          href={`/painel/comunidade/post/${g.post_id}`}
          className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
        >
          Ver na comunidade
        </Link>
      )}

      <p className="mt-3 flex flex-wrap gap-2 text-xs">
        {Object.entries(contagem).map(([m, n]) => (
          <span key={m} className="border border-line-strong px-2 py-1 text-ink-2">
            {ehMotivoDenuncia(m) ? MOTIVOS_DENUNCIA[m] : m}: <strong className="text-ink">{n}</strong>
          </span>
        ))}
      </p>

      <details className="mt-3 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink-2 hover:text-ink">
          Ver as denúncias
        </summary>
        <ul className="mt-1 space-y-2">
          {g.denuncias.map((d, i) => (
            <li key={i} className="border-l-2 border-line-strong pl-3 text-ink-2">
              <strong className="text-ink">{ehMotivoDenuncia(d.motivo) ? MOTIVOS_DENUNCIA[d.motivo] : d.motivo}</strong>
              {" · "}
              {d.denunciante ?? "—"} · {dataHora(d.criado_em)}
              {d.detalhe && <p className="mt-0.5 whitespace-pre-wrap break-words text-campo">{d.detalhe}</p>}
            </li>
          ))}
        </ul>
      </details>

      {g.decisao && (
        <p className="mt-3 text-sm text-ink-2">
          <strong className="text-ink">{DECISOES[g.decisao] ?? g.decisao}</strong>
          {g.decidida_por && ` por ${g.decidida_por}`}
          {g.decidida_em && ` em ${dataHora(g.decidida_em)}`}.
        </p>
      )}

      {(pendente || g.autor) && (
        <div className="mt-4 space-y-3 border-t border-line-2 pt-4">
          <div>
            <label htmlFor={`${id}-motivo`} className="mb-1.5 block text-sm font-semibold text-campo">
              Motivo da decisão <span className="font-normal text-muted">(o autor vê no sino)</span>
            </label>
            <textarea
              id={`${id}-motivo`}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={MOTIVO_MODERACAO_MAX}
              rows={2}
              placeholder="Ex.: spam repetido; ofensa a outro usuário…"
              className={`${CAMPO} resize-y`}
            />
          </div>
          {erro && (
            <p role="alert" className={ALERTA_ERRO}>
              {erro}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {pendente && (
              <>
                <button
                  type="button"
                  onClick={remover}
                  disabled={enviando || !c || removido}
                  className={`${BOTAO_NEUTRO} border-danger/60! text-danger!`}
                >
                  Remover conteúdo
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void agir(
                      { acao: "descartar", tipo: g.alvo_tipo, id: g.alvo_id },
                      "Manter o conteúdo e descartar as denúncias?",
                    )
                  }
                  disabled={enviando}
                  className={BOTAO_NEUTRO}
                >
                  Manter (descartar denúncias)
                </button>
              </>
            )}
          </div>
          {g.autor && (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor={`${id}-duracao`} className="mb-1.5 block text-sm font-semibold text-campo">
                  Suspender o autor por
                </label>
                <select
                  id={`${id}-duracao`}
                  value={duracao}
                  onChange={(e) => setDuracao(e.target.value)}
                  className={`${CAMPO} w-auto`}
                >
                  {DURACOES.map((d) => (
                    <option key={d.valor} value={d.valor}>
                      {d.nome}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={suspender} disabled={enviando} className={BOTAO_NEUTRO}>
                Suspender autor
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function CartaoSuspensao({ suspensao: s }: { suspensao: Suspensao }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function revogar() {
    if (!window.confirm(`Tirar a suspensão de ${s.apelido ?? "este usuário"}?`)) return;
    setErro(null);
    setEnviando(true);
    const falha = await moderar({ acao: "revogar", userId: s.user_id });
    setEnviando(false);
    if (falha) return setErro(falha);
    router.refresh();
  }

  return (
    <div className={`${CARTAO} flex flex-wrap items-center justify-between gap-3 p-4`}>
      <div className="min-w-0 text-sm text-ink-2">
        <p>
          <strong className="text-ink">{s.apelido ?? "—"}</strong>{" "}
          <span className="break-all text-muted">({s.email ?? "sem e-mail"})</span>
        </p>
        <p className="mt-1 font-semibold text-danger">{s.ate ? `Até ${dataHora(s.ate)}` : "Definitiva"}</p>
        <p className="mt-1 break-words">Motivo: {s.motivo}</p>
        <p className="mt-1 text-xs text-muted">
          Por {s.criado_por ?? "—"} em {dataHora(s.criado_em)}
        </p>
        {erro && (
          <p role="alert" className={`${ALERTA_ERRO} mt-2`}>
            {erro}
          </p>
        )}
      </div>
      <button type="button" onClick={revogar} disabled={enviando} className={BOTAO_NEUTRO}>
        Tirar suspensão
      </button>
    </div>
  );
}
