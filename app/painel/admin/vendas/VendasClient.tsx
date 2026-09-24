"use client";

import { useId, useState } from "react";
import { ALERTA_ERRO, BOTAO, BOTAO_SECUNDARIO, CAMPO, CARTAO, EstadoVazio } from "@/components/ui";
import { IconeEscudo, IconeLink, IconeMapa } from "@/components/Icones";

export interface VendaAnalise {
  id: number;
  apelido: string | null;
  email: string | null;
  empresa: string | null;
  maps: string;
  siteUrl: string;
  fechadoEm: string;
  tentativas: number;
  ultimoMotivo: string | null;
  comprovante: string | null;
  ehPdf: boolean;
  enviadoEm: string | null;
}

function dataDoDia(aaaammdd: string) {
  const [a, m, d] = aaaammdd.split("-");
  return `${d}/${m}/${a}`;
}

export default function VendasClient({ vendas: iniciais }: { vendas: VendaAnalise[] }) {
  const [vendas, setVendas] = useState(iniciais);
  const [feitas, setFeitas] = useState<string[]>([]);

  if (!vendas.length) {
    return (
      <div className="mt-8">
        <EstadoVazio
          icone={<IconeEscudo width={26} height={26} />}
          titulo="Nada para analisar"
          texto={feitas.length ? `Pronto! ${feitas.length} análise(s) feita(s) agora.` : "Nenhum comprovante esperando análise."}
        />
      </div>
    );
  }

  return (
    <ul className="mt-6 space-y-4">
      {vendas.map((v) => (
        <li key={v.id}>
          <Cartao
            venda={v}
            onDecidido={(status) => {
              setVendas((vs) => vs.filter((x) => x.id !== v.id));
              setFeitas((f) => [...f, status]);
            }}
          />
        </li>
      ))}
    </ul>
  );
}

function Cartao({ venda, onDecidido }: { venda: VendaAnalise; onDecidido: (status: string) => void }) {
  const id = useId();
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function decidir(aprovar: boolean) {
    if (!aprovar && !motivo.trim()) return setErro("Explique o motivo da recusa (o usuário vai ver).");
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/admin/vendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendaId: venda.id, aprovar, motivo }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(corpo.erro || "Não foi possível salvar.");
      onDecidido(corpo.status);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
      setEnviando(false);
    }
  }

  return (
    <article className={`${CARTAO} p-4 sm:p-5`}>
      <h2 className="break-words text-base font-bold text-ink">{venda.empresa ?? "Empresa sem nome em cache"}</h2>
      <p className="mt-0.5 break-words text-sm text-ink-2">
        {venda.apelido ?? "—"} · {venda.email ?? "sem e-mail"} · fechada em {dataDoDia(venda.fechadoEm)} ·{" "}
        {venda.tentativas} tentativa(s) automática(s)
      </p>

      <div className="mt-2 flex flex-wrap gap-x-4">
        <a href={venda.siteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 break-all text-sm text-primary hover:underline">
          <IconeLink width={16} height={16} className="shrink-0" />
          {venda.siteUrl.replace(/^https?:\/\//i, "")}
        </a>
        <a href={venda.maps} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary hover:underline">
          <IconeMapa width={16} height={16} />
          Abrir no Google Maps
        </a>
      </div>

      {venda.ultimoMotivo && (
        <p className="mt-2 rounded-md bg-canvas px-3 py-2 text-sm text-ink-2">
          <strong className="text-ink">Última verificação automática: </strong>
          {venda.ultimoMotivo}
        </p>
      )}

      <div className="mt-3">
        {venda.comprovante ? (
          venda.ehPdf ? (
            <a href={venda.comprovante} target="_blank" rel="noopener noreferrer" className={BOTAO_SECUNDARIO}>
              Abrir comprovante (PDF)
            </a>
          ) : (
            <a href={venda.comprovante} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={venda.comprovante} alt="Comprovante enviado" className="max-h-96 w-auto max-w-full rounded-md border border-line" />
            </a>
          )
        ) : (
          <p className="text-sm text-danger">Não foi possível abrir o arquivo do comprovante.</p>
        )}
      </div>

      {recusando && (
        <div className="mt-3">
          <label htmlFor={`${id}-motivo`} className="mb-1.5 block text-sm font-semibold text-ink-2">
            Motivo da recusa (o usuário vê)
          </label>
          <textarea
            id={`${id}-motivo`}
            rows={3}
            maxLength={500}
            autoFocus
            className={`${CAMPO} resize-y`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
      )}

      {erro && (
        <p role="alert" className={`mt-3 ${ALERTA_ERRO}`}>
          {erro}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {recusando ? (
          <>
            <button type="button" disabled={enviando} onClick={() => setRecusando(false)} className={`${BOTAO_SECUNDARIO} flex-1 sm:flex-none`}>
              Voltar
            </button>
            <button type="button" disabled={enviando} onClick={() => decidir(false)} className={`${BOTAO} flex-1 bg-danger! sm:flex-none`}>
              {enviando ? "Salvando…" : "Confirmar recusa"}
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={enviando} onClick={() => setRecusando(true)} className={`${BOTAO_SECUNDARIO} flex-1 sm:flex-none`}>
              Recusar
            </button>
            <button type="button" disabled={enviando} onClick={() => decidir(true)} className={`${BOTAO} flex-1 sm:flex-none`}>
              {enviando ? "Salvando…" : "Aprovar venda"}
            </button>
          </>
        )}
      </div>
    </article>
  );
}
