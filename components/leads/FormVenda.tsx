"use client";

// Janela "Marcar como fechado": pede o site entregue (obrigatório), a
// data do fechamento e, se quiser, o valor recebido. No celular abre como
// uma folha que sobe do rodapé; no computador, centralizada.
//
// A validação daqui é só para avisar rápido. Quem decide é o banco
// (função registrar_venda): lead do próprio usuário, venda única, datas.
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { hojeBrasilia, lerValor, normalizarSite, siteValido, type VendaResumo } from "@/lib/leads/funil";
import { ALERTA_ERRO, BOTAO, BOTAO_SECUNDARIO, CAMPO, ROTULO } from "@/components/ui";

export default function FormVenda({
  placeId,
  nomeLead,
  desbloqueadoEm,
  onCancelar,
  onRegistrada,
}: {
  placeId: string;
  nomeLead: string;
  desbloqueadoEm: string;
  onCancelar: () => void;
  onRegistrada: (venda: VendaResumo) => void;
}) {
  const id = useId();
  const hoje = hojeBrasilia();
  const minimo = new Date(desbloqueadoEm).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const [site, setSite] = useState("");
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const primeiroCampo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    primeiroCampo.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelar();
    };
    document.addEventListener("keydown", aoTeclar);
    // Trava a rolagem da página por trás da janela.
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [onCancelar]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const url = normalizarSite(site);
    if (!url) return setErro("Informe o endereço do site entregue.");
    if (!siteValido(url)) return setErro("Endereço do site inválido. Exemplo: https://www.seucliente.com.br");
    if (!data) return setErro("Informe a data do fechamento.");
    if (data > hoje) return setErro("A data do fechamento não pode ser no futuro.");
    if (data < minimo) return setErro("A data do fechamento não pode ser antes do desbloqueio do lead.");
    if (lerValor(valor) === "invalido") return setErro("Valor recebido inválido. Exemplo: 1.500,00");

    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/leads/venda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId, site: url, fechadoEm: data, valor }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok || !corpo.venda) throw new Error(corpo.erro || "Não foi possível registrar a venda.");
      onRegistrada(corpo.venda);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível registrar a venda.");
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 sm:items-center sm:p-6"
      onClick={(ev) => ev.target === ev.currentTarget && !enviando && onCancelar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        className="max-h-dvh w-full max-w-md overflow-y-auto overscroll-contain rounded-t-lg bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-cartao sm:rounded-lg sm:p-6 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <h2 id={`${id}-titulo`} className="text-lg font-bold text-ink">
          Marcar como fechado
        </h2>
        <p className="mt-1 break-words text-sm text-ink-2">
          Venda para <strong className="text-ink">{nomeLead}</strong>. Ela fica pendente de verificação até
          confirmarmos o site no ar.
        </p>

        <form onSubmit={enviar} noValidate className="mt-4 space-y-4">
          <div>
            <label htmlFor={`${id}-site`} className={ROTULO}>
              Endereço do site entregue
            </label>
            <input
              ref={primeiroCampo}
              id={`${id}-site`}
              type="url"
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={500}
              placeholder="www.seucliente.com.br"
              className={CAMPO}
              value={site}
              onChange={(e) => setSite(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor={`${id}-data`} className={ROTULO}>
              Data do fechamento
            </label>
            <input
              id={`${id}-data`}
              type="date"
              required
              min={minimo}
              max={hoje}
              className={CAMPO}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor={`${id}-valor`} className={ROTULO}>
              Valor recebido <span className="font-normal text-muted">(opcional)</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">
                R$
              </span>
              <input
                id={`${id}-valor`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="1.500,00"
                className={`${CAMPO} pl-10!`}
                aria-describedby={`${id}-valor-ajuda`}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
            <p id={`${id}-valor-ajuda`} className="mt-1.5 text-xs text-muted">
              Só você vê. Nunca é exibido publicamente.
            </p>
          </div>

          {erro && (
            <p role="alert" className={ALERTA_ERRO}>
              {erro}
            </p>
          )}

          <div className="flex gap-2 sm:justify-end">
            <button
              type="button"
              onClick={onCancelar}
              disabled={enviando}
              className={`${BOTAO_SECUNDARIO} flex-1 sm:flex-none`}
            >
              Cancelar
            </button>
            <button type="submit" disabled={enviando} className={`${BOTAO} flex-1 sm:flex-none`}>
              {enviando ? "Registrando…" : "Registrar venda"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
