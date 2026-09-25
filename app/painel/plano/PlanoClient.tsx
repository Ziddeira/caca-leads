"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PACOTE_EXTRA,
  PLANOS,
  formatarPreco,
  type FormaPagamento,
  type PlanoId,
  type PlanoPago,
} from "@/lib/planos";
import {
  ALERTA_AVISO,
  ALERTA_ERRO,
  ALERTA_SUCESSO,
  BOTAO,
  BOTAO_SECUNDARIO,
  CAMPO,
  ABA_ATIVA,
  ABA_INATIVA,
  CARTAO as CARTAO_BASE,
  ROTULO,
  TituloPagina,
} from "@/components/ui";

const CARTAO = `${CARTAO_BASE} p-5 sm:p-6`;

interface Perfil {
  plano: string;
  creditosDesbloqueio: number;
  creditosPremio: number;
  buscasRestantes: number;
  validoAte: string | null;
  temClienteAsaas: boolean;
}

interface Assinatura {
  plano: string;
  status: string;
  forma: string;
  link: string | null;
}

type Checkout = { tipo: "assinar"; plano: PlanoPago } | { tipo: "pacote" };

function formatarData(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function nomePlano(id: string) {
  return PLANOS[id as PlanoId]?.nome ?? id;
}

export default function PlanoClient({
  perfil,
  assinatura,
}: {
  perfil: Perfil;
  assinatura: Assinatura | null;
}) {
  const router = useRouter();
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [forma, setForma] = useState<FormaPagamento>("PIX");
  const [nome, setNome] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linkPagamento, setLinkPagamento] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (checkout) formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [checkout]);

  const viva = assinatura && assinatura.status !== "cancelada" ? assinatura : null;
  const validoAte = formatarData(perfil.validoAte);
  const planoPago = perfil.plano !== "gratis";
  const trocaAgendada = viva && planoPago && viva.plano !== perfil.plano ? viva.plano : null;

  async function enviar(url: string, corpo?: unknown) {
    setErro(null);
    setMensagem(null);
    setLinkPagamento(null);
    setCarregando(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(dados.erro || "Não foi possível concluir agora.");
        return null;
      }
      router.refresh();
      return dados;
    } catch {
      setErro("Não foi possível falar com o servidor agora.");
      return null;
    } finally {
      setCarregando(false);
    }
  }

  async function confirmarCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (!checkout) return;
    const dadosCliente = perfil.temClienteAsaas ? {} : { nome, cpfCnpj };
    const dados =
      checkout.tipo === "assinar"
        ? await enviar("/api/plano/assinar", { plano: checkout.plano, forma, ...dadosCliente })
        : await enviar("/api/plano/pacote", { forma, ...dadosCliente });
    if (!dados) return;
    setCheckout(null);
    setLinkPagamento(dados.link ?? null);
    setMensagem(
      checkout.tipo === "assinar"
        ? "Assinatura criada! Pague a fatura para ativar o plano. Assim que o Asaas confirmar o pagamento, seu plano e seus créditos são atualizados automaticamente."
        : "Pedido do pacote criado! Os créditos extras entram assim que o Asaas confirmar o pagamento.",
    );
  }

  async function trocar(plano: PlanoPago) {
    const alvo = PLANOS[plano];
    if (
      !confirm(
        `Trocar para o plano ${alvo.nome} (${formatarPreco(alvo.preco)}/mês)? A troca vale a partir da próxima renovação${validoAte ? ` (${validoAte})` : ""}.`,
      )
    )
      return;
    if (await enviar("/api/plano/trocar", { plano })) {
      setMensagem(`Pronto! A partir da próxima renovação seu plano será o ${alvo.nome}.`);
    }
  }

  async function cancelar() {
    if (
      !confirm(
        `Cancelar a assinatura? Você não será mais cobrado.${
          planoPago && validoAte ? ` Seu plano continua valendo até ${validoAte} e depois volta ao Grátis.` : ""
        } Seus leads já desbloqueados continuam salvos.`,
      )
    )
      return;
    if (await enviar("/api/plano/cancelar")) {
      setMensagem("Assinatura cancelada. Nenhuma nova cobrança será feita.");
    }
  }

  return (
    <div className="max-w-5xl">
      <TituloPagina titulo="Meu plano" descricao="Seu plano atual, seu saldo e as opções de assinatura." />

      {/* Resumo -------------------------------------------------------- */}
      <section className={`${CARTAO} mt-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-muted">Plano atual</p>
            <p className="mt-1 font-display text-3xl font-bold text-ink">{nomePlano(perfil.plano)}</p>
            <p className="mt-1 text-sm text-ink-2">
              {!planoPago
                ? "Sem cobrança."
                : viva?.status === "ativa" || viva?.status === "inadimplente"
                  ? `Próxima renovação: ${validoAte ?? "—"}`
                  : `Válido até ${validoAte ?? "—"} — depois volta ao Grátis.`}
            </p>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-muted">Desbloqueios</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">{perfil.creditosDesbloqueio}</p>
              {perfil.creditosPremio > 0 && (
                <p className="mt-0.5 text-xs text-muted">inclui {perfil.creditosPremio} do prêmio do rank (não vencem)</p>
              )}
            </div>
            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-muted">Buscas</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">{perfil.buscasRestantes}</p>
            </div>
          </div>
        </div>

        {viva?.status === "pendente" && (
          <Alerta>
            Sua assinatura do plano {nomePlano(viva.plano)} está aguardando o primeiro pagamento.{" "}
            {viva.link && <LinkPagamento href={viva.link} />}
          </Alerta>
        )}
        {viva?.status === "inadimplente" && (
          <Alerta>
            O pagamento da renovação não foi aprovado. Pague até {validoAte ?? "o fim do ciclo"} (com 3
            dias de tolerância) para não voltar ao Grátis.{" "}
            {viva.link && <LinkPagamento href={viva.link} />}
          </Alerta>
        )}
        {trocaAgendada && (
          <p className="mt-4 text-sm text-ink-2">
            Troca agendada: a partir da próxima renovação seu plano será o{" "}
            <strong className="text-ink">{nomePlano(trocaAgendada)}</strong>.
          </p>
        )}
        {!viva && planoPago && (
          <p className="mt-4 text-sm text-ink-2">
            Assinatura cancelada: nenhuma nova cobrança será feita.
          </p>
        )}

        {viva && (
          <div className="mt-4 border-t border-line-2 pt-4">
            <button onClick={cancelar} disabled={carregando} className={BOTAO_SECUNDARIO}>
              Cancelar assinatura
            </button>
          </div>
        )}
      </section>

      {(erro || mensagem) && (
        <div role={erro ? "alert" : "status"} className={`mt-4 ${erro ? ALERTA_ERRO : ALERTA_SUCESSO}`}>
          {erro ?? mensagem}{" "}
          {linkPagamento && !erro && <LinkPagamento href={linkPagamento} />}
        </div>
      )}

      {/* Planos -------------------------------------------------------- */}
      <h2 className="mt-10 text-2xl font-bold text-ink">Planos</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        {(Object.keys(PLANOS) as PlanoId[]).map((id) => {
          const p = PLANOS[id];
          const atual = perfil.plano === id;
          return (
            <div key={id} className={`${CARTAO} flex flex-col ${atual ? "border-primary shadow-[inset_0_0_0_1px_var(--ap-yellow)]" : ""}`}>
              <p className="font-display text-lg font-bold uppercase tracking-[0.08em] text-ink">{p.nome}</p>
              <p className="mt-1 text-ink">
                <span className="font-display text-3xl font-bold">{formatarPreco(p.preco)}</span>
                {p.preco > 0 && <span className="text-sm text-ink-2">/mês</span>}
              </p>
              <ul className="mt-3 flex flex-1 flex-col gap-1 text-sm text-ink-2">
                <li>{p.desbloqueios} desbloqueios{p.preco > 0 ? " por mês" : ""}</li>
                <li>{p.buscas} buscas{p.preco > 0 ? " por mês" : ""}</li>
                <li>{p.hospedagem ? "Modo Hospedagem incluso" : "Sem modo Hospedagem"}</li>
              </ul>
              <div className="mt-4">
                {id === "gratis" ? (
                  atual && <Selo>Seu plano</Selo>
                ) : viva ? (
                  viva.plano === id ? (
                    <Selo>{atual ? "Seu plano" : "Na próxima renovação"}</Selo>
                  ) : (
                    <button
                      onClick={() => trocar(id as PlanoPago)}
                      disabled={carregando}
                      className={BOTAO_SECUNDARIO}
                    >
                      Trocar para {p.nome}
                    </button>
                  )
                ) : (
                  // Um primário por tela: o do plano Pro (ou o "Gerar cobrança",
                  // quando o pagamento está aberto).
                  <button
                    onClick={() => setCheckout({ tipo: "assinar", plano: id as PlanoPago })}
                    disabled={carregando}
                    className={id === "pro" && !checkout ? BOTAO : BOTAO_SECUNDARIO}
                  >
                    {atual ? `Assinar ${p.nome} de novo` : `Assinar ${p.nome}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pacote extra -------------------------------------------------- */}
      <section className={`${CARTAO} mt-4 flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <p className="font-display text-lg font-bold uppercase tracking-[0.08em] text-ink">Pacote extra</p>
          <p className="mt-1 text-sm text-ink-2">
            +{PACOTE_EXTRA.desbloqueios} desbloqueios e +{PACOTE_EXTRA.buscas} buscas por{" "}
            <strong className="text-ink">{formatarPreco(PACOTE_EXTRA.preco)}</strong>. Compra avulsa,
            sem assinatura — soma ao seu saldo atual. Na renovação mensal de um plano pago, o saldo
            volta ao limite do plano (não acumula).
          </p>
        </div>
        <button onClick={() => setCheckout({ tipo: "pacote" })} disabled={carregando} className={BOTAO_SECUNDARIO}>
          Comprar pacote extra
        </button>
      </section>

      {/* Checkout -------------------------------------------------------- */}
      {checkout && (
        <form ref={formRef} onSubmit={confirmarCheckout} className={`${CARTAO} mt-4`}>
          <h2 className="text-lg font-bold text-ink">
            {checkout.tipo === "assinar"
              ? `Assinar o plano ${PLANOS[checkout.plano].nome} — ${formatarPreco(PLANOS[checkout.plano].preco)}/mês`
              : `Pacote extra — ${formatarPreco(PACOTE_EXTRA.preco)}`}
          </h2>

          <fieldset className="mt-3">
            <legend className="mb-1 text-sm font-semibold text-ink-2">Forma de pagamento</legend>
            <div className="grid w-full grid-cols-2 gap-1 border border-line bg-canvas p-1 sm:inline-grid sm:w-auto">
              {(["PIX", "CREDIT_CARD"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setForma(f)}
                  aria-pressed={forma === f}
                  className={`min-h-11 px-4 font-display text-sm font-semibold uppercase tracking-[0.08em] transition ${
                    forma === f ? ABA_ATIVA : ABA_INATIVA
                  }`}
                >
                  {f === "PIX" ? "Pix" : "Cartão de crédito"}
                </button>
              ))}
            </div>
          </fieldset>

          {!perfil.temClienteAsaas && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="nome" className={ROTULO}>
                  Nome completo
                </label>
                <input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                  className={CAMPO}
                />
              </div>
              <div>
                <label htmlFor="cpfCnpj" className={ROTULO}>
                  CPF ou CNPJ
                </label>
                <input
                  id="cpfCnpj"
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(e.target.value)}
                  inputMode="numeric"
                  required
                  className={CAMPO}
                />
              </div>
              <p className="text-xs text-muted sm:col-span-2">
                O Asaas exige nome e CPF/CNPJ para emitir a cobrança. Pedimos só na primeira compra.
              </p>
            </div>
          )}

          <p className="mt-3 text-xs text-muted">
            {forma === "PIX"
              ? "Você vai receber um link com o QR Code do Pix."
              : "Os dados do cartão são digitados na página segura do Asaas — nunca passam pelo Ártemis Prospect."}
            {checkout.tipo === "assinar" && " A cobrança se repete todo mês até você cancelar."}
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button type="submit" disabled={carregando} className={BOTAO}>
              {carregando ? "Gerando cobrança..." : "Gerar cobrança"}
            </button>
            <button type="button" onClick={() => setCheckout(null)} className={BOTAO_SECUNDARIO}>
              Voltar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Alerta({ children }: { children: React.ReactNode }) {
  return (
    <div className={`mt-4 ${ALERTA_AVISO}`}>
      {children}
    </div>
  );
}

function Selo({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block border border-primary px-2 py-[3px] font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
      {children}
    </span>
  );
}

function LinkPagamento({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold underline">
      Abrir página de pagamento
    </a>
  );
}
