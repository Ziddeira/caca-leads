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
import { textoDuracao } from "@/lib/cupons";

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

interface Desconto {
  codigo: string;
  valorCheio: number;
  valorComDesconto: number;
  duracaoMeses: number | null;
  ciclosPagos: number;
  status: string;
  proximaCobrancaCheia: string | null;
}

// Resultado da conferência do cupom, feita no servidor. Só para mostrar:
// ao assinar, o navegador manda apenas o código e o servidor recalcula.
interface CupomConferido {
  codigo: string;
  plano: PlanoPago;
  valorCheio: number;
  valorFinal: number;
  duracaoMeses: number | null;
}

type Checkout = { tipo: "assinar"; plano: PlanoPago } | { tipo: "pacote" };

function formatarData(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function nomePlano(id: string) {
  return PLANOS[id as PlanoId]?.nome ?? id;
}

function dataDoDia(aaaammdd: string | null) {
  if (!aaaammdd) return null;
  const [a, m, d] = aaaammdd.split("-");
  return `${d}/${m}/${a}`;
}

export default function PlanoClient({
  perfil,
  assinatura,
  desconto,
}: {
  perfil: Perfil;
  assinatura: Assinatura | null;
  desconto: Desconto | null;
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
  const [codigoCupom, setCodigoCupom] = useState("");
  const [cupom, setCupom] = useState<CupomConferido | null>(null);
  const [erroCupom, setErroCupom] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (checkout) formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [checkout]);

  // Cupom conferido para outro plano não vale: trocou de plano, confere de novo.
  const cupomValido = cupom && checkout?.tipo === "assinar" && cupom.plano === checkout.plano ? cupom : null;

  function abrirCheckout(novo: Checkout) {
    setCheckout(novo);
    setErroCupom(null);
    if (novo.tipo === "assinar" && cupom && cupom.plano !== novo.plano) {
      setCupom(null);
      if (codigoCupom.trim()) setErroCupom("Aplique o cupom de novo para ver o preço deste plano.");
    }
  }

  async function aplicarCupom() {
    if (checkout?.tipo !== "assinar") return;
    setErroCupom(null);
    setCupom(null);
    if (!codigoCupom.trim()) {
      setErroCupom("Digite o código do cupom.");
      return;
    }
    setConferindo(true);
    try {
      const res = await fetch("/api/plano/cupom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: codigoCupom, plano: checkout.plano }),
      });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroCupom(dados.erro || "Não foi possível conferir o cupom.");
        return;
      }
      setCupom(dados as CupomConferido);
    } catch {
      setErroCupom("Não foi possível falar com o servidor agora.");
    } finally {
      setConferindo(false);
    }
  }

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
    // Só o CÓDIGO do cupom vai ao servidor; o preço é calculado lá.
    if (checkout.tipo === "assinar" && codigoCupom.trim() && !cupomValido) {
      setErroCupom("Clique em \"Aplicar\" para conferir o cupom antes de gerar a cobrança, ou apague o código.");
      return;
    }
    const dados =
      checkout.tipo === "assinar"
        ? await enviar("/api/plano/assinar", {
            plano: checkout.plano,
            forma,
            ...(cupomValido ? { cupom: cupomValido.codigo } : {}),
            ...dadosCliente,
          })
        : await enviar("/api/plano/pacote", { forma, ...dadosCliente });
    if (!dados) return;
    setCheckout(null);
    setCupom(null);
    setCodigoCupom("");
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
        {desconto && (
          <p className="mt-4 text-sm text-ink-2">
            Cupom <strong className="text-ink">{desconto.codigo}</strong>:{" "}
            {desconto.status === "voltando"
              ? `o período de desconto terminou. A partir da próxima renovação${
                  desconto.proximaCobrancaCheia ? ` (${dataDoDia(desconto.proximaCobrancaCheia)})` : ""
                }, a mensalidade volta ao preço normal de ${formatarPreco(desconto.valorCheio)}.`
              : `você paga ${formatarPreco(desconto.valorComDesconto)} em vez de ${formatarPreco(desconto.valorCheio)} ${textoDuracao(
                  desconto.duracaoMeses,
                )}${
                  desconto.duracaoMeses
                    ? ` (${Math.min(desconto.ciclosPagos, desconto.duracaoMeses)} de ${desconto.duracaoMeses} já pago${
                        desconto.duracaoMeses > 1 ? "s" : ""
                      }). Depois, volta sozinho ao preço normal.`
                    : "."
                }`}
          </p>
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
            <div key={id} className={`${CARTAO} flex flex-col ${atual ? "border-destaque shadow-[inset_0_0_0_1px_var(--color-destaque)]" : ""}`}>
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
                    onClick={() => abrirCheckout({ tipo: "assinar", plano: id as PlanoPago })}
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
        <button onClick={() => abrirCheckout({ tipo: "pacote" })} disabled={carregando} className={BOTAO_SECUNDARIO}>
          Comprar pacote extra
        </button>
      </section>

      {/* Checkout -------------------------------------------------------- */}
      {checkout && (
        <form ref={formRef} onSubmit={confirmarCheckout} className={`${CARTAO} mt-4`}>
          <h2 className="text-lg font-bold text-ink">
            {checkout.tipo === "assinar"
              ? `Assinar o plano ${PLANOS[checkout.plano].nome} — ${formatarPreco(
                  cupomValido ? cupomValido.valorFinal : PLANOS[checkout.plano].preco,
                )}/mês`
              : `Pacote extra — ${formatarPreco(PACOTE_EXTRA.preco)}`}
          </h2>

          {checkout.tipo === "assinar" && (
            <div className="mt-3">
              <label htmlFor="cupom" className={ROTULO}>
                Cupom de desconto (opcional)
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="cupom"
                  value={codigoCupom}
                  onChange={(e) => {
                    setCodigoCupom(e.target.value.toUpperCase().replace(/\s/g, ""));
                    setCupom(null);
                    setErroCupom(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      aplicarCupom();
                    }
                  }}
                  maxLength={30}
                  autoCapitalize="characters"
                  autoComplete="off"
                  placeholder="EX.: LANCAMENTO50"
                  className={`${CAMPO} uppercase sm:max-w-xs`}
                />
                <button type="button" onClick={aplicarCupom} disabled={conferindo || carregando} className={BOTAO_SECUNDARIO}>
                  {conferindo ? "Conferindo..." : "Aplicar"}
                </button>
              </div>
              {erroCupom && (
                <p role="alert" className={`mt-2 ${ALERTA_ERRO}`}>
                  {erroCupom}
                </p>
              )}
              {cupomValido && (
                <div role="status" className={`mt-2 ${ALERTA_SUCESSO}`}>
                  Cupom <strong>{cupomValido.codigo}</strong> aplicado:{" "}
                  <span className="line-through">{formatarPreco(cupomValido.valorCheio)}</span>{" "}
                  <strong>{formatarPreco(cupomValido.valorFinal)}/mês</strong> {textoDuracao(cupomValido.duracaoMeses)}.
                  {cupomValido.duracaoMeses
                    ? ` Depois, a assinatura volta sozinha ao preço normal de ${formatarPreco(
                        cupomValido.valorCheio,
                      )}/mês — avisamos pelo sino uma semana antes.`
                    : ""}
                </div>
              )}
            </div>
          )}

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
            <button
              type="button"
              onClick={() => {
                setCheckout(null);
                setErroCupom(null);
              }}
              className={BOTAO_SECUNDARIO}
            >
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
    <span className="inline-block border border-destaque px-2 py-[3px] font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-destaque">
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
