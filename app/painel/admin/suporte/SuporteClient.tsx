"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ALERTA_ERRO, BOTAO, CAMPO, CARTAO, EstadoVazio, ROTULO } from "@/components/ui";
import { IconeAjuda } from "@/components/Icones";
import { ASSUNTOS, COR_SITUACAO, RESPOSTA_MAX, SITUACOES, type Assunto, type Situacao } from "@/lib/suporte/regras";

export interface ChamadoAdmin {
  id: number;
  email: string | null;
  apelido: string | null;
  assunto: Assunto;
  descricao: string;
  anexo: string | null;
  temAnexo: boolean;
  situacao: Situacao;
  diagnostico: Record<string, unknown>;
  resposta: string | null;
  respondidoEm: string | null;
  criadoEm: string;
}

const FUSO = "America/Sao_Paulo";
const NOME_PLANO: Record<string, string> = { gratis: "Grátis", solo: "Solo", pro: "Pro" };

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" });
}

// Os dados que o banco guardou na hora do chamado, em linguagem simples.
function linhasDiagnostico(d: Record<string, unknown>) {
  const txt = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
  const saldo = [
    txt(d.buscas_restantes) && `${d.buscas_restantes} buscas`,
    txt(d.creditos_desbloqueio) && `${d.creditos_desbloqueio} desbloqueios`,
    Number(d.creditos_premio) > 0 && `${d.creditos_premio} de prêmio`,
  ]
    .filter(Boolean)
    .join(", ");
  return [
    ["E-mail", txt(d.email)],
    ["Plano", txt(d.plano) && (NOME_PLANO[String(d.plano)] ?? String(d.plano))],
    ["Válido até", txt(d.plano_valido_ate) && new Date(String(d.plano_valido_ate)).toLocaleDateString("pt-BR", { timeZone: FUSO })],
    ["Assinatura Asaas", txt(d.assinatura)],
    ["Saldo", saldo || null],
    ["Página", txt(d.pagina)],
    ["Navegador", txt(d.navegador)],
  ].filter((l): l is [string, string] => !!l[1]);
}

export default function SuporteClient({ chamados }: { chamados: ChamadoAdmin[] }) {
  if (!chamados.length) {
    return <EstadoVazio icone={<IconeAjuda width={26} height={26} />} titulo="Nenhum chamado" texto="Nada por aqui neste filtro." />;
  }
  return (
    <ul className="space-y-4">
      {chamados.map((c) => (
        <li key={c.id}>
          <Cartao chamado={c} />
        </li>
      ))}
    </ul>
  );
}

function Cartao({ chamado: c }: { chamado: ChamadoAdmin }) {
  const id = useId();
  const router = useRouter();
  const [resposta, setResposta] = useState(c.resposta ?? "");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(situacao: Situacao) {
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/admin/suporte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, resposta, situacao }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(corpo.erro || "Não foi possível salvar.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  }

  function responder(e: FormEvent) {
    e.preventDefault();
    salvar("respondido");
  }

  return (
    <article className={`${CARTAO} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-bold text-ink">
            #{c.id} · {ASSUNTOS[c.assunto]}
          </h2>
          <p className="break-words text-sm text-ink-2">
            {c.apelido ?? "—"} · {c.email ?? "sem e-mail"} · {dataHora(c.criadoEm)}
          </p>
        </div>
        <span className={`border px-2 py-[3px] font-display text-[11px] font-semibold uppercase leading-tight tracking-[0.08em] ${COR_SITUACAO[c.situacao]}`}>
          {SITUACOES[c.situacao]}
        </span>
      </div>

      <p className="mt-3 whitespace-pre-line break-words text-ink">{c.descricao}</p>

      {c.temAnexo &&
        (c.anexo ? (
          <a href={c.anexo} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.anexo} alt="Imagem anexada ao chamado" className="max-h-80 w-auto max-w-full rounded-md border border-line" />
          </a>
        ) : (
          <p className="mt-3 text-sm text-danger">Não foi possível abrir a imagem anexada.</p>
        ))}

      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-primary">Dados da conta no momento do chamado</summary>
        <dl className="grid gap-x-4 gap-y-1 rounded-md bg-canvas p-3 text-sm sm:grid-cols-[auto_1fr]">
          {linhasDiagnostico(c.diagnostico).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-ink-2">{k}</dt>
              <dd className="break-all text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </details>

      <form onSubmit={responder} className="mt-3 space-y-3 border-t border-line-2 pt-3">
        <div>
          <label htmlFor={`${id}-resposta`} className={ROTULO}>
            {c.resposta ? "Sua resposta (editar e reenviar avisa o usuário de novo)" : "Sua resposta (o usuário é avisado no sino)"}
          </label>
          <textarea
            id={`${id}-resposta`}
            rows={4}
            maxLength={RESPOSTA_MAX}
            className={`${CAMPO} resize-y`}
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
          />
          {c.respondidoEm && <p className="mt-1 text-xs text-muted">Última resposta em {dataHora(c.respondidoEm)}</p>}
        </div>
        {erro && (
          <p role="alert" className={ALERTA_ERRO}>
            {erro}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={enviando || !resposta.trim()} className={`${BOTAO} flex-1 sm:flex-none`}>
            {enviando ? "Salvando…" : "Enviar resposta"}
          </button>
          {c.situacao !== "resolvido" ? (
            <button
              type="button"
              disabled={enviando}
              onClick={() => salvar("resolvido")}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-line bg-surface px-5 text-sm font-semibold text-ink-2 hover:bg-canvas sm:flex-none"
            >
              Marcar como resolvido
            </button>
          ) : (
            <button
              type="button"
              disabled={enviando}
              onClick={() => salvar("aberto")}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-line bg-surface px-5 text-sm font-semibold text-ink-2 hover:bg-canvas sm:flex-none"
            >
              Reabrir
            </button>
          )}
        </div>
      </form>
    </article>
  );
}
