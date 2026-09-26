"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PLANOS, formatarPreco, type PlanoPago } from "@/lib/planos";
import {
  CODIGO_CUPOM,
  PISO_ASAAS,
  normalizarCodigo,
  precoFinalPlano,
  textoDesconto,
  textoDuracao,
  type TipoDesconto,
} from "@/lib/cupons";
import {
  ABA_ATIVA,
  ABA_INATIVA,
  ALERTA_ERRO,
  ALERTA_SUCESSO,
  BOTAO,
  BOTAO_SECUNDARIO,
  CAMPO,
  CARTAO,
  ROTULO,
} from "@/components/ui";

export interface Cupom {
  id: number;
  codigo: string;
  tipo_desconto: TipoDesconto;
  valor_desconto: number;
  duracao_meses: number | null;
  planos: PlanoPago[];
  inicio_em: string;
  fim_em: string;
  limite_total: number | null;
  limite_por_usuario: number;
  so_novos: boolean;
  ativo: boolean;
  criado_em: string;
  usos: number;
  assinantes: number;
  ativos: number;
  desconto_concedido: number;
  receita: number;
  abaixo_do_piso: boolean;
}

export interface RegistroAuditoria {
  id: number;
  admin_email: string | null;
  acao: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  criado_em: string;
}

const PLANOS_PAGOS: PlanoPago[] = ["solo", "pro"];

const DURACOES: { valor: "1" | "3" | "sempre"; nome: string }[] = [
  { valor: "1", nome: "Só o 1º mês" },
  { valor: "3", nome: "3 primeiros meses" },
  { valor: "sempre", nome: "Enquanto durar" },
];

const NOME_ACAO: Record<string, string> = {
  cupom_criado: "Criou o cupom",
  cupom_editado: "Editou o cupom",
  cupom_pausado: "Pausou o cupom",
  cupom_reativado: "Reativou o cupom",
  cupom_piso_alterado: "Mudou o piso",
};

function dataDoDia(aaaammdd: string) {
  const [a, m, d] = aaaammdd.split("-");
  return `${d}/${m}/${a}`;
}

function somarDias(aaaammdd: string, dias: number) {
  const d = new Date(`${aaaammdd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

function lerNumero(texto: string) {
  const n = Number(texto.replace(",", "."));
  return texto.trim() === "" || !Number.isFinite(n) ? null : n;
}

interface Formulario {
  id: number | null;
  codigo: string;
  tipo: TipoDesconto;
  valor: string;
  duracao: "1" | "3" | "sempre";
  planos: PlanoPago[];
  inicio: string;
  fim: string;
  limiteTotal: string;
  limiteUsuario: string;
  soNovos: boolean;
  ativo: boolean;
}

function formularioVazio(hoje: string): Formulario {
  return {
    id: null,
    codigo: "",
    tipo: "percentual",
    valor: "",
    duracao: "1",
    planos: ["solo", "pro"],
    inicio: hoje,
    fim: somarDias(hoje, 30),
    limiteTotal: "",
    limiteUsuario: "1",
    soNovos: true,
    ativo: true,
  };
}

function formularioDoCupom(c: Cupom): Formulario {
  return {
    id: c.id,
    codigo: c.codigo,
    tipo: c.tipo_desconto,
    valor: String(Number(c.valor_desconto)).replace(".", ","),
    duracao: c.duracao_meses === 1 ? "1" : c.duracao_meses === 3 ? "3" : "sempre",
    planos: c.planos,
    inicio: c.inicio_em,
    fim: c.fim_em,
    limiteTotal: c.limite_total == null ? "" : String(c.limite_total),
    limiteUsuario: String(c.limite_por_usuario),
    soNovos: c.so_novos,
    ativo: c.ativo,
  };
}

export default function PromocoesClient({
  piso,
  cupons,
  auditoria,
  hoje,
}: {
  piso: number;
  cupons: Cupom[];
  auditoria: RegistroAuditoria[];
  hoje: string;
}) {
  const [form, setForm] = useState<Formulario>(() => formularioVazio(hoje));

  function editar(c: Cupom) {
    setForm(formularioDoCupom(c));
    document.getElementById("form-cupom")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-10">
      <Piso piso={piso} />
      <FormCupom
        key={form.id ?? "novo"}
        inicial={form}
        piso={piso}
        hoje={hoje}
        aoTerminar={() => setForm(formularioVazio(hoje))}
      />

      <section>
        <h2 className="text-lg font-bold text-ink">Cupons e resultados</h2>
        <p className="mt-0.5 text-sm text-ink-2">
          Usos = assinaturas criadas com o cupom (quem desistiu antes de pagar não conta). Assinantes = quem pagou
          ao menos uma mensalidade. Desconto e receita somam só pagamentos confirmados e não estornados.
        </p>
        {cupons.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">Nenhum cupom ainda.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {cupons.map((c) => (
              <li key={c.id}>
                <CartaoCupom cupom={c} hoje={hoje} aoEditar={() => editar(c)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink">Histórico (auditoria)</h2>
        <p className="mt-0.5 text-sm text-ink-2">Quem criou, editou, pausou ou reativou cada cupom, e as mudanças no piso.</p>
        {auditoria.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">Nada registrado ainda.</p>
        ) : (
          <div className={`${CARTAO} mt-3 overflow-x-auto`}>
            <table className="w-full min-w-[36rem] text-left text-sm [&_td]:border-t [&_td]:border-line-2 [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2.5 [&_th]:font-semibold [&_th]:text-ink-2">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>O quê</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {auditoria.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{dataHora(r.criado_em)}</td>
                    <td className="break-all">{r.admin_email ?? "—"}</td>
                    <td>{NOME_ACAO[r.acao] ?? r.acao}</td>
                    <td className="text-ink-2">{resumoAuditoria(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// Uma linha legível do que mudou.
function resumoAuditoria(r: RegistroAuditoria) {
  const depois = r.depois ?? {};
  const antes = r.antes ?? {};
  if (r.acao === "cupom_piso_alterado") {
    return `${formatarPreco(Number(antes.piso_minimo))} → ${formatarPreco(Number(depois.piso_minimo))}`;
  }
  const codigo = String(depois.codigo ?? antes.codigo ?? "");
  if (r.acao !== "cupom_editado") return codigo;
  const mudou = Object.keys(depois).filter(
    (k) => !["atualizado_em", "criado_em"].includes(k) && JSON.stringify(depois[k]) !== JSON.stringify(antes[k]),
  );
  return `${codigo}${mudou.length ? ` · mudou: ${mudou.join(", ")}` : ""}`;
}

// Piso ---------------------------------------------------------------------

function Piso({ piso }: { piso: number }) {
  const router = useRouter();
  const [valor, setValor] = useState(piso.toFixed(2).replace(".", ","));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/admin/promocoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ piso: lerNumero(valor) }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(corpo.erro || "Não foi possível salvar.");
      setSucesso(`Piso salvo: ${formatarPreco(corpo.piso)}.`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <h2 className="text-lg font-bold text-ink">Piso de preço</h2>
      <p className="mt-0.5 text-sm text-ink-2">
        O menor valor mensal que um assinante pode pagar com qualquer cupom — o seu custo mínimo por assinante.
        Cupons que deixariam o preço abaixo disso são recusados. Nunca menos que {formatarPreco(PISO_ASAAS)} (mínimo do
        Asaas).
      </p>
      <form onSubmit={salvar} className={`${CARTAO} mt-3 flex flex-wrap items-end gap-3 p-4`}>
        <div>
          <label htmlFor="piso" className={ROTULO}>Piso (R$ por mês)</label>
          <input id="piso" inputMode="decimal" required className={`${CAMPO} w-40`} value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
        <button type="submit" disabled={enviando} className={BOTAO_SECUNDARIO}>
          {enviando ? "Salvando…" : "Salvar piso"}
        </button>
        {erro && <p role="alert" className={`w-full ${ALERTA_ERRO}`}>{erro}</p>}
        {sucesso && <p role="status" className={`w-full ${ALERTA_SUCESSO}`}>{sucesso}</p>}
      </form>
    </section>
  );
}

// Criar / editar -------------------------------------------------------------

function FormCupom({
  inicial,
  piso,
  hoje,
  aoTerminar,
}: {
  inicial: Formulario;
  piso: number;
  hoje: string;
  aoTerminar: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState<Formulario>(inicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const editando = f.id !== null;

  function mudar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setF((atual) => ({ ...atual, [campo]: valor }));
  }

  function alternarPlano(p: PlanoPago) {
    mudar("planos", f.planos.includes(p) ? f.planos.filter((x) => x !== p) : [...f.planos, p]);
  }

  // Prévia do valor final (a conta que vale é a do banco, ao salvar).
  const valor = lerNumero(f.valor);
  const previa = PLANOS_PAGOS.filter((p) => f.planos.includes(p)).map((p) => {
    const final = valor && valor > 0 ? precoFinalPlano(p, f.tipo, valor) : null;
    const empate = p === "pro" && final === PLANOS.solo.preco;
    return { plano: p, final, abaixo: final !== null && final < piso, empate };
  });
  const bloqueado = previa.some((x) => x.abaixo || x.empate) || (f.tipo === "percentual" && (valor ?? 0) > 100);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    if (!editando && !CODIGO_CUPOM.test(normalizarCodigo(f.codigo))) {
      setErro('Código inválido: use de 3 a 30 letras, números, "-" ou "_", sem espaço nem acento.');
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/admin/promocoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: f.id,
          codigo: normalizarCodigo(f.codigo),
          tipo: f.tipo,
          valor: lerNumero(f.valor),
          duracao: f.duracao === "sempre" ? null : Number(f.duracao),
          planos: f.planos,
          inicio: f.inicio,
          fim: f.fim,
          limiteTotal: f.limiteTotal.trim() === "" ? null : f.limiteTotal,
          limiteUsuario: f.limiteUsuario,
          soNovos: f.soNovos,
          ativo: f.ativo,
        }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(corpo.erro || "Não foi possível salvar.");
      setSucesso(editando ? `Cupom ${corpo.codigo} atualizado.` : `Cupom ${corpo.codigo} criado.`);
      router.refresh();
      if (editando) aoTerminar();
      else setF((atual) => ({ ...atual, codigo: "", valor: "" }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section id="form-cupom" className="scroll-mt-4">
      <h2 className="text-lg font-bold text-ink">{editando ? `Editar cupom ${f.codigo}` : "Novo cupom"}</h2>
      <p className="mt-0.5 text-sm text-ink-2">
        {editando
          ? "As mudanças valem para quem usar o cupom daqui em diante. Quem já assinou continua com o desconto combinado."
          : "O assinante digita o código em Meu plano antes de assinar e vê o preço com desconto antes de confirmar."}
      </p>
      <form onSubmit={enviar} className={`${CARTAO} mt-3 space-y-5 p-4 sm:p-5`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cupom-codigo" className={ROTULO}>Código</label>
            <input
              id="cupom-codigo"
              required
              disabled={editando}
              maxLength={30}
              placeholder="LANCAMENTO50"
              autoCapitalize="characters"
              className={`${CAMPO} uppercase disabled:opacity-70`}
              value={f.codigo}
              onChange={(e) => mudar("codigo", e.target.value.toUpperCase().replace(/\s/g, ""))}
            />
            <p className="mt-1 text-xs text-muted">
              {editando ? "O código não muda depois de criado." : "Letras maiúsculas, números, - ou _. Único."}
            </p>
          </div>
          <div>
            <label htmlFor="cupom-valor" className={ROTULO}>
              {f.tipo === "percentual" ? "Desconto (%)" : "Desconto (R$ por mês)"}
            </label>
            <input
              id="cupom-valor"
              required
              inputMode="decimal"
              placeholder={f.tipo === "percentual" ? "50" : "10,00"}
              className={CAMPO}
              value={f.valor}
              onChange={(e) => mudar("valor", e.target.value)}
            />
          </div>
        </div>

        <Escolha rotulo="Tipo de desconto">
          {(["percentual", "fixo"] as const).map((t) => (
            <BotaoEscolha key={t} ativo={f.tipo === t} onClick={() => mudar("tipo", t)}>
              {t === "percentual" ? "Percentual" : "Valor fixo"}
            </BotaoEscolha>
          ))}
        </Escolha>

        <Escolha rotulo="Duração do desconto">
          {DURACOES.map((d) => (
            <BotaoEscolha key={d.valor} ativo={f.duracao === d.valor} onClick={() => mudar("duracao", d.valor)}>
              {d.nome}
            </BotaoEscolha>
          ))}
        </Escolha>

        <fieldset>
          <legend className={ROTULO}>Vale para os planos</legend>
          <div className="flex flex-wrap gap-4">
            {PLANOS_PAGOS.map((p) => (
              <label key={p} className="flex min-h-11 items-center gap-2 text-ink">
                <input type="checkbox" className="size-5 accent-[var(--color-destaque)]" checked={f.planos.includes(p)} onChange={() => alternarPlano(p)} />
                {PLANOS[p].nome} ({formatarPreco(PLANOS[p].preco)})
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cupom-inicio" className={ROTULO}>Vale a partir de</label>
            <input id="cupom-inicio" type="date" required className={CAMPO} value={f.inicio} onChange={(e) => mudar("inicio", e.target.value)} />
          </div>
          <div>
            <label htmlFor="cupom-fim" className={ROTULO}>Vale até (inclusive)</label>
            <input id="cupom-fim" type="date" required min={editando ? undefined : f.inicio > hoje ? f.inicio : hoje} className={CAMPO} value={f.fim} onChange={(e) => mudar("fim", e.target.value)} />
          </div>
          <div>
            <label htmlFor="cupom-limite-total" className={ROTULO}>Limite total de usos</label>
            <input id="cupom-limite-total" inputMode="numeric" placeholder="Sem limite" className={CAMPO} value={f.limiteTotal} onChange={(e) => mudar("limiteTotal", e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <label htmlFor="cupom-limite-usuario" className={ROTULO}>Limite por usuário</label>
            <input id="cupom-limite-usuario" inputMode="numeric" required className={CAMPO} value={f.limiteUsuario} onChange={(e) => mudar("limiteUsuario", e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>

        <div className="space-y-1">
          <label className="flex min-h-11 items-center gap-2 text-ink">
            <input type="checkbox" className="size-5 accent-[var(--color-destaque)]" checked={f.soNovos} onChange={(e) => mudar("soNovos", e.target.checked)} />
            Só para quem nunca assinou (nenhuma mensalidade paga antes)
          </label>
          <label className="flex min-h-11 items-center gap-2 text-ink">
            <input type="checkbox" className="size-5 accent-[var(--color-destaque)]" checked={f.ativo} onChange={(e) => mudar("ativo", e.target.checked)} />
            Ativo (desmarcado = pausado)
          </label>
        </div>

        {/* Valor final que o assinante pagaria */}
        <div className="border border-line-2 bg-canvas p-3">
          <p className="text-sm font-semibold text-ink">Quanto o assinante pagaria por mês</p>
          {previa.length === 0 ? (
            <p className="mt-1 text-sm text-ink-2">Escolha ao menos um plano.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {previa.map((x) => (
                <li key={x.plano} className={x.abaixo || x.empate ? "text-danger" : "text-ink"}>
                  {PLANOS[x.plano].nome}: {formatarPreco(PLANOS[x.plano].preco)} →{" "}
                  <strong>{x.final === null ? "—" : formatarPreco(x.final)}</strong>
                  {x.final !== null && ` ${textoDuracao(f.duracao === "sempre" ? null : Number(f.duracao))}`}
                  {x.abaixo && ` — abaixo do piso de ${formatarPreco(piso)}`}
                  {x.empate && " — igual ao preço cheio do Solo; ajuste alguns centavos"}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-muted">Depois do período de desconto, a assinatura volta sozinha ao preço normal.</p>
        </div>

        {erro && <p role="alert" className={ALERTA_ERRO}>{erro}</p>}
        {sucesso && <p role="status" className={ALERTA_SUCESSO}>{sucesso}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" disabled={enviando || bloqueado || f.planos.length === 0} className={`${BOTAO} disabled:cursor-not-allowed`}>
            {enviando ? "Salvando…" : editando ? "Salvar alterações" : "Criar cupom"}
          </button>
          {editando && (
            <button type="button" onClick={aoTerminar} className={BOTAO_SECUNDARIO}>
              Cancelar edição
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function Escolha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className={ROTULO}>{rotulo}</legend>
      <div className="grid w-full grid-cols-1 gap-1 border border-line bg-canvas p-1 sm:inline-grid sm:w-auto sm:auto-cols-fr sm:grid-flow-col">
        {children}
      </div>
    </fieldset>
  );
}

function BotaoEscolha({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`min-h-11 px-4 font-display text-sm font-semibold uppercase tracking-[0.08em] transition ${ativo ? ABA_ATIVA : ABA_INATIVA}`}
    >
      {children}
    </button>
  );
}

// Cartão de um cupom na lista -------------------------------------------------

function CartaoCupom({ cupom: c, hoje, aoEditar }: { cupom: Cupom; hoje: string; aoEditar: () => void }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const usos = Number(c.usos);
  const esgotado = c.limite_total != null && usos >= c.limite_total;
  const situacao = !c.ativo
    ? "Pausado"
    : c.fim_em < hoje
      ? "Expirado"
      : c.inicio_em > hoje
        ? "Agendado"
        : esgotado
          ? "Esgotado"
          : "No ar";

  async function pausar(ativo: boolean) {
    setEnviando(true);
    setErro(null);
    const res = await fetch("/api/admin/promocoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, ativo }),
    });
    const corpo = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) {
      setErro(corpo.erro || "Não foi possível salvar.");
      return;
    }
    router.refresh();
  }

  return (
    <article className={`${CARTAO} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-all font-display text-lg font-bold tracking-[0.06em] text-ink">{c.codigo}</h3>
        <span
          className={`border px-2 py-[3px] font-display text-[11px] font-semibold uppercase leading-tight tracking-[0.08em] ${
            situacao === "No ar"
              ? "border-primary bg-primary text-primary-ink"
              : situacao === "Agendado"
                ? "border-destaque text-destaque"
                : "border-line-strong text-ink-2"
          }`}
        >
          {situacao}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink">
        {textoDesconto(c.tipo_desconto, Number(c.valor_desconto))} {textoDuracao(c.duracao_meses)} ·{" "}
        {c.planos.map((p) => `${PLANOS[p].nome} por ${formatarPreco(precoFinalPlano(p, c.tipo_desconto, Number(c.valor_desconto)))}`).join(" · ")}
      </p>
      <p className="mt-1 text-xs text-muted">
        {dataDoDia(c.inicio_em)} a {dataDoDia(c.fim_em)} · limite {c.limite_total ?? "sem limite"} no total,{" "}
        {c.limite_por_usuario} por pessoa{c.so_novos ? " · só quem nunca assinou" : ""}
      </p>
      {c.abaixo_do_piso && (
        <p className={`mt-2 ${ALERTA_ERRO}`}>Abaixo do piso atual: este cupom está sendo recusado. Edite o desconto ou pause.</p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Dado rotulo="Usos" valor={c.limite_total != null ? `${usos} / ${c.limite_total}` : String(usos)} />
        <Dado rotulo="Assinantes" valor={String(c.assinantes)} />
        <Dado rotulo="Ainda ativos" valor={String(c.ativos)} />
        <Dado rotulo="Desconto dado" valor={formatarPreco(Number(c.desconto_concedido))} />
        <Dado rotulo="Receita" valor={formatarPreco(Number(c.receita))} />
      </dl>

      {erro && <p role="alert" className={`mt-2 ${ALERTA_ERRO}`}>{erro}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={aoEditar} disabled={enviando} className={BOTAO_SECUNDARIO}>
          Editar
        </button>
        <button type="button" onClick={() => pausar(!c.ativo)} disabled={enviando} className={BOTAO_SECUNDARIO}>
          {enviando ? "Salvando…" : c.ativo ? "Pausar" : "Reativar"}
        </button>
      </div>
    </article>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-ink-2">{rotulo}</dt>
      <dd className="font-display text-xl font-bold tabular-nums text-ink">{valor}</dd>
    </div>
  );
}
