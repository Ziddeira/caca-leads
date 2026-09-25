"use client";

// Janela "Agendar retorno": pede o dia, o horário e, se quiser, uma
// observação. Depois de salvar, mostra o botão que abre o evento na
// agenda (arquivo .ics). No celular abre como uma folha que sobe do
// rodapé; no computador, centralizada — igual ao formulário da venda.
//
// A validação daqui é só para avisar rápido. Quem decide é o banco
// (função agendar_retorno_lead): lead do próprio usuário, data futura.
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  OBS_RETORNO_MAX,
  instanteBrasilia,
  linkGoogleAgenda,
  linkIcs,
  partesBrasilia,
  textoRetorno,
  type EventoRetorno,
  type RetornoLead,
} from "@/lib/leads/retorno";
import { ALERTA_ERRO, ALERTA_SUCESSO, BOTAO, BOTAO_SECUNDARIO, CAMPO, ROTULO } from "@/components/ui";
import { IconeCalendario } from "@/components/Icones";

const DIA_MS = 86_400_000;

export default function FormRetorno({
  placeId,
  lead,
  retorno,
  onFechar,
  onSalvo,
}: {
  placeId: string;
  // Nome, telefone e situação do lead, para o evento da agenda.
  lead: Omit<EventoRetorno, "placeId" | "observacao" | "inicio">;
  retorno: RetornoLead | null;
  onFechar: () => void;
  onSalvo: (retorno: RetornoLead | null) => void;
}) {
  const id = useId();
  const [agora] = useState(() => Date.now());
  const hoje = partesBrasilia(new Date(agora)).data;
  const maximo = partesBrasilia(new Date(agora + 365 * DIA_MS)).data;
  const inicial = retorno ? partesBrasilia(retorno.em) : null;

  const [data, setData] = useState(inicial?.data ?? partesBrasilia(new Date(agora + DIA_MS)).data);
  const [hora, setHora] = useState(inicial?.hora ?? "09:00");
  const [obs, setObs] = useState(retorno?.obs ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Depois de salvo, a janela mostra os botões da agenda.
  const [salvo, setSalvo] = useState<RetornoLead | null>(null);
  const primeiroCampo = useRef<HTMLInputElement>(null);
  const botaoAgenda = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    // Trava a rolagem da página por trás da janela.
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [onFechar]);

  useEffect(() => {
    if (salvo) botaoAgenda.current?.focus();
    else primeiroCampo.current?.focus();
  }, [salvo]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!data) return setErro("Informe o dia do retorno.");
    if (!hora) return setErro("Informe o horário do retorno.");
    if (instanteBrasilia(data, hora).getTime() <= Date.now()) {
      return setErro("Escolha um dia e horário que ainda não passaram.");
    }
    if (data > maximo) return setErro("O retorno pode ser marcado para no máximo 1 ano à frente.");
    await salvar({ placeId, data, hora, observacao: obs });
  }

  async function salvar(corpoPedido: Record<string, unknown>) {
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/leads/retorno", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoPedido),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok || !("retorno" in corpo)) throw new Error(corpo.erro || "Não foi possível salvar o retorno.");
      onSalvo(corpo.retorno);
      if (corpo.retorno) setSalvo(corpo.retorno);
      else onFechar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar o retorno.");
    } finally {
      setEnviando(false);
    }
  }

  const evento: EventoRetorno | null = salvo
    ? { ...lead, placeId, observacao: salvo.obs, inicio: salvo.em }
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center sm:p-6"
      onClick={(ev) => ev.target === ev.currentTarget && !enviando && onFechar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        className="max-h-dvh w-full max-w-md overflow-y-auto overscroll-contain border border-line bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-cartao sm:rounded-lg sm:p-6 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <h2 id={`${id}-titulo`} className="text-lg font-bold text-ink">
          {salvo ? "Retorno agendado" : retorno ? "Alterar retorno" : "Agendar retorno"}
        </h2>

        {salvo && evento ? (
          <div className="mt-3 space-y-4">
            <p className={ALERTA_SUCESSO} role="status">
              Retorno com <strong className="break-words">{lead.nome}</strong> marcado para{" "}
              <strong>{textoRetorno(salvo.em, agora)}</strong>. No dia, você recebe um aviso no sino.
            </p>

            <div>
              {/* Link comum, sem "download": no iPhone, o Safari abre o
                  arquivo direto no app Calendário. */}
              <a ref={botaoAgenda} href={linkIcs(placeId, salvo.em)} className={`${BOTAO} w-full`}>
                <IconeCalendario width={18} height={18} />
                Adicionar ao calendário
              </a>
              <p className="mt-2 text-xs text-muted">
                No iPhone, abre direto no Calendário: é só tocar em “Adicionar”. No computador e no Android, o
                arquivo .ics é baixado — abra-o para adicionar ao Google Agenda, Calendário ou Outlook. O evento
                dura 30 minutos e avisa 30 minutos antes.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <a
                href={linkGoogleAgenda(evento)}
                target="_blank"
                rel="noopener noreferrer"
                className={`${BOTAO_SECUNDARIO} sm:flex-none`}
              >
                Abrir no Google Agenda
              </a>
              <button type="button" onClick={onFechar} className={`${BOTAO_SECUNDARIO} sm:flex-none`}>
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 break-words text-sm text-ink-2">
              Quando voltar a falar com <strong className="text-ink">{lead.nome}</strong>? Horário de Brasília.
            </p>

            <form onSubmit={enviar} noValidate className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${id}-data`} className={ROTULO}>
                    Dia
                  </label>
                  <input
                    ref={primeiroCampo}
                    id={`${id}-data`}
                    type="date"
                    required
                    min={hoje}
                    max={maximo}
                    className={CAMPO}
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor={`${id}-hora`} className={ROTULO}>
                    Horário
                  </label>
                  <input
                    id={`${id}-hora`}
                    type="time"
                    required
                    step={300}
                    className={CAMPO}
                    value={hora}
                    onChange={(e) => setHora(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor={`${id}-obs`} className={ROTULO}>
                  Observação <span className="font-normal text-muted">(opcional)</span>
                </label>
                <textarea
                  id={`${id}-obs`}
                  rows={2}
                  maxLength={OBS_RETORNO_MAX}
                  placeholder="Ex.: ligar depois do almoço, levar proposta."
                  className={`${CAMPO} resize-y`}
                  aria-describedby={`${id}-obs-contador`}
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                />
                <p id={`${id}-obs-contador`} className="mt-1 text-xs text-muted" aria-live="polite">
                  {obs.length}/{OBS_RETORNO_MAX}
                </p>
              </div>

              {erro && (
                <p role="alert" className={ALERTA_ERRO}>
                  {erro}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                {retorno && (
                  <button
                    type="button"
                    onClick={() => salvar({ placeId, remover: true })}
                    disabled={enviando}
                    className="inline-flex min-h-11 items-center justify-center text-sm font-semibold text-danger underline-offset-2 hover:underline disabled:opacity-70 sm:mr-auto"
                  >
                    Remover retorno
                  </button>
                )}
                <div className="flex gap-2 sm:ml-auto">
                  <button
                    type="button"
                    onClick={onFechar}
                    disabled={enviando}
                    className={`${BOTAO_SECUNDARIO} flex-1 sm:flex-none`}
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={enviando} className={`${BOTAO} flex-1 sm:flex-none`}>
                    {enviando ? "Salvando…" : "Agendar"}
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
