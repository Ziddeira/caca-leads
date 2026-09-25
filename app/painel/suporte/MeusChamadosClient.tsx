"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ALERTA_ERRO, BOTAO_SECUNDARIO, CARTAO, EstadoVazio } from "@/components/ui";
import { IconeAjuda } from "@/components/Icones";
import { ASSUNTOS, COR_SITUACAO, SITUACOES, type Assunto, type Situacao } from "@/lib/suporte/regras";

export interface MeuChamado {
  id: number;
  assunto: Assunto;
  descricao: string;
  anexo: string | null;
  situacao: Situacao;
  resposta: string | null;
  respondidoEm: string | null;
  criadoEm: string;
}

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export default function MeusChamadosClient({ chamados }: { chamados: MeuChamado[] }) {
  if (!chamados.length) {
    return (
      <div className="mt-8">
        <EstadoVazio
          icone={<IconeAjuda width={26} height={26} />}
          titulo="Nenhum chamado ainda"
          texto='Precisou de algo? Toque em "Preciso de ajuda", no canto da tela.'
        />
      </div>
    );
  }
  return (
    <ul className="mt-6 space-y-4">
      {chamados.map((c) => (
        <li key={c.id}>
          <Cartao chamado={c} />
        </li>
      ))}
    </ul>
  );
}

function Cartao({ chamado: c }: { chamado: MeuChamado }) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function resolver() {
    setSalvando(true);
    setErro(null);
    const res = await fetch("/api/suporte/resolver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id }),
    });
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(corpo.erro || "Não foi possível salvar.");
      setSalvando(false);
      return;
    }
    router.refresh();
  }

  return (
    <article className={`${CARTAO} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-bold text-ink">
            #{c.id} · {ASSUNTOS[c.assunto]}
          </h2>
          <p className="text-xs text-muted">Aberto em {dataHora(c.criadoEm)}</p>
        </div>
        <span className={`border px-2 py-[3px] font-display text-[11px] font-semibold uppercase leading-tight tracking-[0.08em] ${COR_SITUACAO[c.situacao]}`}>
          {SITUACOES[c.situacao]}
        </span>
      </div>

      <p className="mt-2 whitespace-pre-line break-words text-sm text-ink-2">{c.descricao}</p>
      {c.anexo && (
        <a href={c.anexo} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.anexo} alt="Imagem anexada ao chamado" className="max-h-40 w-auto max-w-full rounded-md border border-line" />
        </a>
      )}

      {c.resposta ? (
        <div className="mt-3 rounded-md border border-primary/20 bg-primary-soft px-3 py-2.5">
          <p className="text-xs font-semibold text-primary">
            Resposta do suporte{c.respondidoEm && ` · ${dataHora(c.respondidoEm)}`}
          </p>
          <p className="mt-1 whitespace-pre-line break-words text-sm text-ink">{c.resposta}</p>
        </div>
      ) : (
        c.situacao === "aberto" && <p className="mt-3 text-sm text-muted">Aguardando resposta.</p>
      )}

      {erro && (
        <p role="alert" className={`mt-3 ${ALERTA_ERRO}`}>
          {erro}
        </p>
      )}
      {c.situacao !== "resolvido" && (
        <button type="button" disabled={salvando} onClick={resolver} className={`${BOTAO_SECUNDARIO} mt-3`}>
          {salvando ? "Salvando…" : "Marcar como resolvido"}
        </button>
      )}
    </article>
  );
}
