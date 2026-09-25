"use client";

// Histórico das vendas do usuário, com a situação de cada uma, o motivo
// quando não foi verificada e as duas ações possíveis: corrigir o endereço
// e (depois de 3 tentativas) enviar comprovante.
import { useId, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ESTILO_STATUS_VENDA,
  ROTULO_STATUS_VENDA,
  normalizarSite,
  siteValido,
  type StatusVenda,
} from "@/lib/leads/funil";
import {
  COMPROVANTE_BUCKET,
  COMPROVANTE_MAX_BYTES,
  COMPROVANTE_TIPOS,
  TENTATIVAS_PARA_COMPROVANTE,
  emAberto,
  podeEnviarComprovante,
} from "@/lib/vendas/regras";
import { ALERTA_AVISO, ALERTA_ERRO, ALERTA_SUCESSO, BOTAO, BOTAO_SECUNDARIO, CAMPO, CARTAO } from "@/components/ui";
import { IconeEnviar, IconeLink } from "@/components/Icones";

export interface VendaScore {
  id: number;
  placeId: string;
  nome: string | null;
  siteUrl: string;
  fechadoEm: string; // AAAA-MM-DD
  status: StatusVenda;
  motivo: string | null;
  pontos: number;
  tentativas: number;
  ultimaVerificacaoEm: string | null;
}

function dataDoDia(aaaammdd: string) {
  const [a, m, d] = aaaammdd.split("-");
  return `${d}/${m}/${a}`;
}

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function semProtocolo(url: string) {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export default function ScoreClient({ vendas: iniciais }: { vendas: VendaScore[] }) {
  const [vendas, setVendas] = useState(iniciais);

  function atualizar(id: number, mudanca: Partial<VendaScore>) {
    setVendas((vs) => vs.map((v) => (v.id === id ? { ...v, ...mudanca } : v)));
  }

  return (
    <ul className="mt-4 space-y-3">
      {vendas.map((v) => (
        <li key={v.id}>
          <CartaoVenda venda={v} onMudar={(m) => atualizar(v.id, m)} />
        </li>
      ))}
    </ul>
  );
}

function CartaoVenda({ venda, onMudar }: { venda: VendaScore; onMudar: (m: Partial<VendaScore>) => void }) {
  const [corrigindo, setCorrigindo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const aberta = emAberto(venda.status);
  const mostraMotivo = venda.motivo && venda.status !== "verificada";

  return (
    <article className={`${CARTAO} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words text-base font-bold text-ink">{venda.nome ?? semProtocolo(venda.siteUrl)}</h3>
          <p className="mt-0.5 text-sm text-muted">Fechada em {dataDoDia(venda.fechadoEm)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center border px-2 py-[3px] font-display text-[11px] font-semibold uppercase leading-tight tracking-[0.08em] ${ESTILO_STATUS_VENDA[venda.status]}`}
          >
            {ROTULO_STATUS_VENDA[venda.status]}
          </span>
          <span className="font-display text-sm font-bold text-ink" aria-label={`${venda.pontos} pontos`}>
            {venda.pontos} pts
          </span>
        </div>
      </div>

      <a
        href={venda.siteUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex min-h-11 max-w-full items-center gap-1.5 break-all text-sm text-primary underline-offset-2 hover:underline"
      >
        <IconeLink width={16} height={16} className="shrink-0" />
        {semProtocolo(venda.siteUrl)}
      </a>

      {mostraMotivo && (
        <p className={`mt-2 ${venda.status === "aguardando_google" ? ALERTA_AVISO : ALERTA_ERRO}`}>
          {venda.status === "recusada" ? <strong>Motivo da recusa: </strong> : null}
          {venda.motivo}
        </p>
      )}

      <p className="mt-2 text-xs text-muted">
        {situacaoExtra(venda)}
      </p>

      {aviso && (
        <p role="status" className={`mt-3 ${ALERTA_SUCESSO}`}>
          {aviso}
        </p>
      )}

      {aberta && !corrigindo && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={BOTAO_SECUNDARIO}
            onClick={() => {
              setAviso(null);
              setCorrigindo(true);
            }}
          >
            Corrigir endereço
          </button>
          {podeEnviarComprovante(venda.status, venda.tentativas) && (
            <EnviarComprovante
              vendaId={venda.id}
              onEnviado={() => {
                onMudar({ status: "em_analise", motivo: null });
                setAviso("Comprovante enviado. Vamos analisar e a resposta aparece aqui.");
              }}
            />
          )}
        </div>
      )}

      {corrigindo && (
        <CorrigirSite
          venda={venda}
          onCancelar={() => setCorrigindo(false)}
          onCorrigido={(siteUrl) => {
            onMudar({ siteUrl, status: "pendente_verificacao", motivo: null, ultimaVerificacaoEm: null });
            setCorrigindo(false);
            setAviso("Endereço atualizado. Ele será verificado na próxima rodada semanal.");
          }}
        />
      )}
    </article>
  );
}

function situacaoExtra(v: VendaScore): string {
  const feitas = v.tentativas === 1 ? "1 verificação feita" : `${v.tentativas} verificações feitas`;
  switch (v.status) {
    case "pendente_verificacao":
      return v.tentativas
        ? `${feitas}. O endereço será verificado de novo na próxima rodada semanal.`
        : "Será verificada na próxima rodada semanal (toda segunda-feira).";
    case "aguardando_google":
    case "nao_verificada": {
      const ultima = v.ultimaVerificacaoEm ? ` Última: ${dataCurta(v.ultimaVerificacaoEm)}.` : "";
      const falta = TENTATIVAS_PARA_COMPROVANTE - v.tentativas;
      const comprovante =
        falta > 0
          ? ` Se não confirmar em mais ${falta === 1 ? "1 tentativa" : `${falta} tentativas`}, você poderá enviar um comprovante.`
          : " Se preferir, envie um comprovante para análise manual.";
      return `${feitas}.${ultima} Tentamos de novo na próxima semana.${comprovante}`;
    }
    case "em_analise":
      return "Recebemos seu comprovante. A resposta aparece aqui.";
    case "verificada":
      return "Venda confirmada. Conta no rank do mês em que foi verificada.";
    case "recusada":
      return "Esta venda não vale pontos.";
  }
}

function CorrigirSite({
  venda,
  onCancelar,
  onCorrigido,
}: {
  venda: VendaScore;
  onCancelar: () => void;
  onCorrigido: (siteUrl: string) => void;
}) {
  const id = useId();
  const [site, setSite] = useState(semProtocolo(venda.siteUrl));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const url = normalizarSite(site);
    if (!url || !siteValido(url)) return setErro("Endereço do site inválido. Exemplo: https://www.seucliente.com.br");
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/vendas/corrigir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: venda.placeId, site: url }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok || !corpo.siteUrl) throw new Error(corpo.erro || "Não foi possível corrigir o endereço.");
      onCorrigido(corpo.siteUrl);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível corrigir o endereço.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="mt-3 space-y-2">
      <label htmlFor={`${id}-site`} className="block text-sm font-semibold text-ink-2">
        Endereço certo do site
      </label>
      <input
        id={`${id}-site`}
        type="url"
        inputMode="url"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus
        maxLength={500}
        className={CAMPO}
        value={site}
        onChange={(e) => setSite(e.target.value)}
      />
      {erro && (
        <p role="alert" className={ALERTA_ERRO}>
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} disabled={enviando} className={`${BOTAO_SECUNDARIO} flex-1 sm:flex-none`}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} className={`${BOTAO} flex-1 sm:flex-none`}>
          {enviando ? "Salvando…" : "Salvar endereço"}
        </button>
      </div>
    </form>
  );
}

function EnviarComprovante({ vendaId, onEnviado }: { vendaId: number; onEnviado: () => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(arquivo: File) {
    const ext = COMPROVANTE_TIPOS[arquivo.type];
    if (!ext) return setErro("Envie uma imagem (JPG, PNG ou WEBP) ou um PDF.");
    if (arquivo.size > COMPROVANTE_MAX_BYTES) return setErro("O arquivo pode ter no máximo 5 MB.");

    setErro(null);
    setEnviando(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sua sessão expirou. Entre de novo.");

      // Pasta do próprio usuário (as regras do bucket só deixam enviar
      // para ela). O nome leva o número da venda, conferido pelo banco.
      const path = `${user.id}/${vendaId}-${Date.now()}.${ext}`;
      const { error: erroUpload } = await supabase.storage
        .from(COMPROVANTE_BUCKET)
        .upload(path, arquivo, { contentType: arquivo.type, upsert: false });
      if (erroUpload) throw new Error("Não foi possível enviar o arquivo. Confira o tamanho (até 5 MB) e o tipo.");

      const res = await fetch("/api/vendas/comprovante", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendaId, path }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(corpo.erro || "Não foi possível enviar o comprovante.");
      onEnviado();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar o comprovante.");
      setEnviando(false);
    }
  }

  return (
    <div className="w-full sm:w-auto">
      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = "";
          if (arquivo) enviar(arquivo);
        }}
      />
      <button
        type="button"
        disabled={enviando}
        onClick={() => entrada.current?.click()}
        className={`${BOTAO} w-full sm:w-auto`}
      >
        <IconeEnviar width={18} height={18} />
        {enviando ? "Enviando…" : "Enviar comprovante"}
      </button>
      <p className="mt-1 text-xs text-muted">Imagem ou PDF, até 5 MB. Ex.: print do Google Maps com o site, nota fiscal.</p>
      {erro && (
        <p role="alert" className={`mt-2 ${ALERTA_ERRO}`}>
          {erro}
        </p>
      )}
    </div>
  );
}
