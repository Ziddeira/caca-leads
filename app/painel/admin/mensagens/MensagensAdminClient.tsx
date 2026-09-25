"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { IconeBandeira } from "@/components/Icones";
import { ALERTA_ERRO, BOTAO_NEUTRO, CAMPO, CARTAO, EstadoVazio } from "@/components/ui";
import { dataHoraCompleta } from "@/components/comunidade/api";
import { MOTIVO_MODERACAO_MAX } from "@/lib/comunidade/regras";
import { MOTIVOS_DENUNCIA, NOTA_MODERACAO_MAX, ehMotivoDenuncia } from "@/lib/mensagens/regras";

export interface DenunciaChat {
  id: number;
  conversa_id: number | null;
  motivo: string;
  detalhe: string | null;
  mensagens: { id: number; de: "denunciante" | "denunciado"; texto: string; imagem: string | null; criado_em: string }[];
  criado_em: string;
  situacao: "pendente" | "resolvida" | "descartada";
  decisao: string | null;
  decidida_em: string | null;
  decidida_por: string | null;
  denunciante: { apelido: string | null; email: string | null } | null;
  denunciado: {
    id: string;
    apelido: string | null;
    email: string | null;
    suspenso_ate: string | null;
    denuncias_recebidas: number;
  } | null;
}

const DURACOES = [
  { valor: "1", nome: "1 dia" },
  { valor: "3", nome: "3 dias" },
  { valor: "7", nome: "7 dias" },
  { valor: "30", nome: "30 dias" },
  { valor: "90", nome: "90 dias" },
  { valor: "definitiva", nome: "Definitiva" },
];

async function enviar(url: string, corpo: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(url, {
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
  return ate === "infinity" ? "Suspenso de forma definitiva" : `Suspenso até ${dataHoraCompleta(ate)}`;
}

export default function MensagensAdminClient({
  denuncias,
  urls,
  pendentes,
}: {
  denuncias: DenunciaChat[];
  urls: Record<string, string>;
  pendentes: boolean;
}) {
  if (denuncias.length === 0) {
    return (
      <EstadoVazio
        icone={<IconeBandeira width={26} height={26} />}
        titulo={pendentes ? "Nenhuma denúncia pendente" : "Nada por aqui"}
        texto={pendentes ? "Nenhuma conversa foi denunciada." : "Nenhuma denúncia neste filtro."}
      />
    );
  }
  return (
    <ul className="space-y-4">
      {denuncias.map((d) => (
        <li key={d.id}>
          <CartaoDenuncia denuncia={d} urls={urls} />
        </li>
      ))}
    </ul>
  );
}

function CartaoDenuncia({ denuncia: d, urls }: { denuncia: DenunciaChat; urls: Record<string, string> }) {
  const router = useRouter();
  const id = useId();
  const [nota, setNota] = useState("");
  const [motivo, setMotivo] = useState("");
  const [duracao, setDuracao] = useState("7");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pendente = d.situacao === "pendente";
  const nomeDenunciante = d.denunciante?.apelido ?? "Denunciante";
  const nomeDenunciado = d.denunciado?.apelido ?? "Denunciado";
  const suspenso = textoSuspensao(d.denunciado?.suspenso_ate ?? null);

  async function decidir(situacao: "resolvida" | "descartada") {
    const pergunta =
      situacao === "resolvida" ? "Marcar esta denúncia como resolvida?" : "Descartar esta denúncia (nada a fazer)?";
    if (!window.confirm(pergunta)) return;
    setErro(null);
    setEnviando(true);
    const falha = await enviar("/api/admin/mensagens", { acao: "decidir", id: d.id, situacao, nota });
    setEnviando(false);
    if (falha) return setErro(falha);
    router.refresh();
  }

  async function suspender() {
    if (!d.denunciado) return;
    if (!motivo.trim()) return setErro("Escreva o motivo da suspensão (a pessoa recebe no sino).");
    const definitiva = duracao === "definitiva";
    const pergunta = definitiva
      ? `Suspender ${nomeDenunciado} DE FORMA DEFINITIVA (comunidade e mensagens)?`
      : `Suspender ${nomeDenunciado} por ${duracao} dia(s) (comunidade e mensagens)?`;
    if (!window.confirm(pergunta)) return;
    setErro(null);
    setEnviando(true);
    let falha = await enviar("/api/admin/comunidade", {
      acao: "suspender",
      userId: d.denunciado.id,
      dias: definitiva ? null : Number(duracao),
      motivo,
    });
    // Suspendeu: a denúncia fica resolvida junto.
    if (!falha && pendente) {
      falha = await enviar("/api/admin/mensagens", {
        acao: "decidir",
        id: d.id,
        situacao: "resolvida",
        nota: nota || `Suspenso: ${motivo}`.slice(0, NOTA_MODERACAO_MAX),
      });
    }
    setEnviando(false);
    if (falha) return setErro(falha);
    router.refresh();
  }

  return (
    <article className={`${CARTAO} p-4 sm:p-5`}>
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <span className="border border-primary px-2 py-0.5 font-display text-xs font-semibold uppercase tracking-[0.1em] text-primary">
          Denúncia #{d.id}
        </span>
        <strong className="text-ink">{ehMotivoDenuncia(d.motivo) ? MOTIVOS_DENUNCIA[d.motivo] : d.motivo}</strong>
        <span className="text-muted">· {dataHoraCompleta(d.criado_em)}</span>
      </header>

      <dl className="mt-3 grid gap-2 text-sm text-ink-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Quem denunciou</dt>
          <dd>
            <strong className="text-ink">{d.denunciante?.apelido ?? "—"}</strong>{" "}
            <span className="break-all text-muted">({d.denunciante?.email ?? "conta apagada"})</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Denunciado</dt>
          <dd>
            {d.denunciado ? (
              <>
                <strong className="text-ink">{d.denunciado.apelido ?? "—"}</strong>{" "}
                <span className="break-all text-muted">({d.denunciado.email ?? "sem e-mail"})</span>
                <span className="block text-xs">
                  {d.denunciado.denuncias_recebidas} denúncia(s) de chat no total
                  {suspenso && <span className="ml-2 font-semibold text-danger">{suspenso}</span>}
                </span>
              </>
            ) : (
              "conta apagada"
            )}
          </dd>
        </div>
      </dl>
      {d.detalhe && (
        <p className="mt-3 whitespace-pre-wrap break-words border-l-2 border-line-strong pl-3 text-sm text-campo">
          {d.detalhe}
        </p>
      )}

      <details className="mt-3" open={pendente}>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-ink-2 hover:text-ink">
          Últimas {d.mensagens.length} mensagens (cópia feita na hora da denúncia)
        </summary>
        <ol className="mt-2 max-h-[28rem] space-y-1.5 overflow-y-auto border border-line bg-canvas p-3">
          {d.mensagens.map((m) => {
            const denunciado = m.de === "denunciado";
            const url = m.imagem ? urls[m.imagem] : null;
            return (
              <li key={m.id} className={`flex ${denunciado ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] border px-3 py-2 ${
                    denunciado ? "border-danger/40 bg-danger-soft" : "border-line bg-surface"
                  }`}
                >
                  <p className="text-[11px] font-semibold text-muted">
                    {denunciado ? nomeDenunciado : nomeDenunciante} · {dataHoraCompleta(m.criado_em)}
                  </p>
                  {m.imagem &&
                    (url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Imagem da mensagem denunciada" className="max-h-48 border border-line object-contain" />
                      </a>
                    ) : (
                      <p className="mt-1 text-xs text-muted">(imagem indisponível)</p>
                    ))}
                  {m.texto && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-campo">{m.texto}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </details>

      {!pendente && (
        <p className="mt-3 text-sm text-ink-2">
          <strong className="text-ink">{d.situacao === "resolvida" ? "Resolvida" : "Descartada"}</strong>
          {d.decidida_por && ` por ${d.decidida_por}`}
          {d.decidida_em && ` em ${dataHoraCompleta(d.decidida_em)}`}
          {d.decisao && `. ${d.decisao}`}
        </p>
      )}

      <div className="mt-4 space-y-3 border-t border-line-2 pt-4">
        {pendente && (
          <>
            <div>
              <label htmlFor={`${id}-nota`} className="mb-1.5 block text-sm font-semibold text-campo">
                Anotação <span className="font-normal text-muted">(opcional, só a Gestão vê)</span>
              </label>
              <textarea
                id={`${id}-nota`}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                maxLength={NOTA_MODERACAO_MAX}
                rows={2}
                className={`${CAMPO} resize-y`}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => decidir("resolvida")} disabled={enviando} className={BOTAO_NEUTRO}>
                Marcar resolvida
              </button>
              <button type="button" onClick={() => decidir("descartada")} disabled={enviando} className={BOTAO_NEUTRO}>
                Descartar
              </button>
            </div>
          </>
        )}
        {d.denunciado && (
          <div className="space-y-2">
            <label htmlFor={`${id}-motivo`} className="block text-sm font-semibold text-campo">
              Motivo da suspensão <span className="font-normal text-muted">(a pessoa vê no sino)</span>
            </label>
            <textarea
              id={`${id}-motivo`}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={MOTIVO_MODERACAO_MAX}
              rows={2}
              placeholder="Ex.: assédio por mensagem privada"
              className={`${CAMPO} resize-y`}
            />
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor={`${id}-duracao`} className="mb-1.5 block text-sm font-semibold text-campo">
                  Suspender por
                </label>
                <select
                  id={`${id}-duracao`}
                  value={duracao}
                  onChange={(e) => setDuracao(e.target.value)}
                  className={`${CAMPO} w-auto`}
                >
                  {DURACOES.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.nome}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={suspender}
                disabled={enviando}
                className={`${BOTAO_NEUTRO} border-danger/60! text-danger!`}
              >
                {pendente ? "Suspender e resolver" : "Suspender"}
              </button>
            </div>
            <p className="text-xs text-muted">
              A suspensão vale para a Comunidade e as Mensagens. Para tirar, use Gestão &gt; Comunidade &gt; Suspensões
              ativas.
            </p>
          </div>
        )}
        {erro && (
          <p role="alert" className={ALERTA_ERRO}>
            {erro}
          </p>
        )}
      </div>
    </article>
  );
}
