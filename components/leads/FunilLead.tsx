"use client";

// Parte do cartão do lead que cuida do funil: situação (lista nativa, que
// no celular abre o seletor do próprio sistema — dois toques), data do
// último contato, anotação livre e, quando houver, a venda registrada.
import { useId, useState } from "react";
import {
  ANOTACAO_MAX,
  ESTILO_FUNIL,
  ROTULO_FUNIL,
  ROTULO_STATUS_VENDA,
  SITUACOES_FUNIL,
  type SituacaoFunil,
  type VendaResumo,
} from "@/lib/leads/funil";
import { BOTAO, BOTAO_SECUNDARIO, CAMPO } from "@/components/ui";
import { IconeAnotacao, IconeLink, IconeVenda } from "@/components/Icones";

export interface FunilEstado {
  situacao: SituacaoFunil;
  anotacao: string | null;
  ultimoContatoEm: string | null;
  venda: VendaResumo | null;
}

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// "2026-09-24" → "24/09/2026", sem passar por fuso horário.
function dataDoDia(aaaammdd: string) {
  const [a, m, d] = aaaammdd.split("-");
  return `${d}/${m}/${a}`;
}

export default function FunilLead({
  funil,
  salvandoSituacao,
  onMudarSituacao,
  onMarcarFechado,
  onSalvarAnotacao,
}: {
  funil: FunilEstado;
  salvandoSituacao: boolean;
  onMudarSituacao: (s: SituacaoFunil) => void;
  onMarcarFechado: () => void;
  onSalvarAnotacao: (texto: string) => Promise<string | null>;
}) {
  const id = useId();
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [erroNota, setErroNota] = useState<string | null>(null);

  function abrirNota() {
    setRascunho(funil.anotacao ?? "");
    setErroNota(null);
    setEditando(true);
  }

  async function salvarNota() {
    setSalvandoNota(true);
    const erro = await onSalvarAnotacao(rascunho);
    setSalvandoNota(false);
    if (erro) setErroNota(erro);
    else setEditando(false);
  }

  return (
    <div className="mt-4 border-t border-line-2 pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {funil.venda ? (
          <span
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold ${ESTILO_FUNIL.fechado}`}
          >
            <IconeVenda width={18} height={18} />
            Fechado
          </span>
        ) : (
          <>
            <label htmlFor={`${id}-situacao`} className="sr-only">
              Situação do lead
            </label>
            <select
              id={`${id}-situacao`}
              value={funil.situacao}
              disabled={salvandoSituacao}
              onChange={(e) => {
                const nova = e.target.value as SituacaoFunil;
                if (nova === "fechado") onMarcarFechado();
                else onMudarSituacao(nova);
              }}
              className={`min-h-11 cursor-pointer rounded-md border px-3 py-2 text-sm font-semibold outline-none transition focus:ring-4 focus:ring-primary-soft disabled:cursor-wait disabled:opacity-70 ${ESTILO_FUNIL[funil.situacao]}`}
            >
              {SITUACOES_FUNIL.map((s) => (
                <option key={s} value={s}>
                  {s === "fechado" ? "Fechado (registrar venda)…" : ROTULO_FUNIL[s]}
                </option>
              ))}
            </select>
          </>
        )}
        <span className="text-xs text-muted">
          {funil.ultimoContatoEm ? `Último contato: ${dataCurta(funil.ultimoContatoEm)}` : "Sem contato registrado"}
        </span>
      </div>

      {funil.venda && (
        <div className="mt-2 rounded-md bg-canvas px-3 py-2 text-sm">
          <p className="font-semibold text-ink">
            Venda em {dataDoDia(funil.venda.fechadoEm)} ·{" "}
            <span className={funil.venda.status === "recusada" ? "text-danger" : "text-hot-ink"}>
              {ROTULO_STATUS_VENDA[funil.venda.status]}
            </span>
          </p>
          <a
            href={funil.venda.siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex min-h-11 max-w-full items-center gap-1.5 break-all text-primary underline-offset-2 hover:underline"
          >
            <IconeLink width={16} height={16} className="shrink-0" />
            {funil.venda.siteUrl.replace(/^https?:\/\//i, "")}
          </a>
        </div>
      )}

      {editando ? (
        <div className="mt-3">
          <label htmlFor={`${id}-nota`} className="mb-1.5 block text-sm font-semibold text-ink-2">
            Anotação
          </label>
          <textarea
            id={`${id}-nota`}
            rows={3}
            maxLength={ANOTACAO_MAX}
            autoFocus
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            placeholder="Ex.: falei com a dona, pediu orçamento para sexta."
            className={`${CAMPO} resize-y`}
            aria-describedby={`${id}-nota-contador`}
          />
          <div className="mt-1 flex items-start justify-between gap-2">
            <p id={`${id}-nota-contador`} className="text-xs text-muted" aria-live="polite">
              {rascunho.length}/{ANOTACAO_MAX}
            </p>
            {erroNota && (
              <p role="alert" className="text-right text-xs text-danger">
                {erroNota}
              </p>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setEditando(false)}
              disabled={salvandoNota}
              className={`${BOTAO_SECUNDARIO} flex-1 sm:flex-none`}
            >
              Cancelar
            </button>
            <button type="button" onClick={salvarNota} disabled={salvandoNota} className={`${BOTAO} flex-1 sm:flex-none`}>
              {salvandoNota ? "Salvando…" : "Salvar anotação"}
            </button>
          </div>
        </div>
      ) : funil.anotacao ? (
        <button
          type="button"
          onClick={abrirNota}
          className="mt-3 flex min-h-11 w-full items-start gap-2 rounded-md bg-canvas px-3 py-2 text-left text-sm text-ink-2 transition hover:text-ink"
          aria-label="Editar anotação"
        >
          <IconeAnotacao width={16} height={16} className="mt-0.5 shrink-0 text-muted" />
          <span className="min-w-0 whitespace-pre-line break-words">{funil.anotacao}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={abrirNota}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-2 hover:underline"
        >
          <IconeAnotacao width={16} height={16} />
          Adicionar anotação
        </button>
      )}
    </div>
  );
}
