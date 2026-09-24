"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ALERTA_ERRO, BOTAO, BOTAO_SECUNDARIO, CAMPO, CARTAO, ROTULO } from "@/components/ui";

export interface Conta {
  id: string;
  email: string | null;
  apelido: string | null;
  plano: string;
  creditos_desbloqueio: number;
  creditos_premio: number;
  buscas_restantes: number;
  plano_valido_ate: string | null;
  created_at: string;
  is_admin: boolean;
  assinatura_status: string | null;
}

export interface RegistroAuditoria {
  id: number;
  alvo_id: string;
  admin_email: string | null;
  acao: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  motivo: string | null;
  criado_em: string;
}

const FUSO = "America/Sao_Paulo";
const NOME_PLANO: Record<string, string> = { gratis: "Grátis", solo: "Solo", pro: "Pro" };
const NOME_ACAO: Record<string, string> = {
  ajuste_conta: "Ajuste de conta",
  venda_aprovada: "Venda aprovada",
  venda_recusada: "Venda recusada",
};
const NOME_CAMPO: Record<string, string> = {
  plano: "plano",
  creditos_desbloqueio: "desbloqueios",
  buscas_restantes: "buscas",
  plano_valido_ate: "válido até",
  status: "situação",
};

function data(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: FUSO }) : "—";
}

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" });
}

// O plano pago vale até a meia-noite do dia seguinte ao último dia; aqui
// volta para o último dia, no formato do campo de data.
function ultimoDia(iso: string | null) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() - 1000);
  return d.toLocaleDateString("en-CA", { timeZone: FUSO });
}

function mostrarValor(campo: string, v: unknown) {
  if (v === null || v === undefined) return "—";
  if (campo === "plano") return NOME_PLANO[String(v)] ?? String(v);
  if (campo === "plano_valido_ate") return data(String(v));
  return String(v);
}

function resumoMudanca(r: RegistroAuditoria) {
  const antes = r.antes ?? {};
  const depois = r.depois ?? {};
  return Object.keys(depois)
    .filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]))
    .map((k) => `${NOME_CAMPO[k] ?? k}: ${mostrarValor(k, antes[k])} → ${mostrarValor(k, depois[k])}`)
    .join(" · ");
}

export default function UsuariosClient({ contas, auditoria }: { contas: Conta[]; auditoria: RegistroAuditoria[] }) {
  return (
    <ul className="space-y-3">
      {contas.map((c) => (
        <li key={c.id}>
          <CartaoConta conta={c} historico={auditoria.filter((r) => r.alvo_id === c.id)} />
        </li>
      ))}
    </ul>
  );
}

function CartaoConta({ conta: c, historico }: { conta: Conta; historico: RegistroAuditoria[] }) {
  const [editando, setEditando] = useState(false);
  return (
    <article className={`${CARTAO} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-bold text-ink">
            {c.apelido ?? "—"}
            {c.is_admin && <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">admin</span>}
          </h3>
          <p className="break-all text-sm text-ink-2">{c.email ?? "sem e-mail"}</p>
        </div>
        {!editando && (
          <button type="button" onClick={() => setEditando(true)} className={BOTAO_SECUNDARIO}>
            Ajustar saldo e plano
          </button>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <Item rotulo="Plano" valor={NOME_PLANO[c.plano] ?? c.plano} />
        <Item rotulo="Válido até" valor={c.plano === "gratis" ? "—" : c.plano_valido_ate ? ultimoDia(c.plano_valido_ate).split("-").reverse().join("/") : "sem data"} />
        <Item rotulo="Desbloqueios" valor={`${c.creditos_desbloqueio}${c.creditos_premio ? ` + ${c.creditos_premio} prêmio` : ""}`} />
        <Item rotulo="Buscas" valor={String(c.buscas_restantes)} />
        <Item rotulo="Assinatura Asaas" valor={c.assinatura_status ?? "nenhuma"} />
        <Item rotulo="Cadastro" valor={data(c.created_at)} />
      </dl>

      {editando && <FormAjuste conta={c} onFechar={() => setEditando(false)} />}

      {historico.length > 0 && (
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-primary">
            Histórico de ajustes ({historico.length})
          </summary>
          <ul className="space-y-2 text-sm">
            {historico.map((r) => (
              <li key={r.id} className="rounded-md bg-canvas px-3 py-2">
                <p className="text-ink">
                  <strong>{NOME_ACAO[r.acao] ?? r.acao}</strong> · {dataHora(r.criado_em)} · por {r.admin_email ?? "—"}
                </p>
                {resumoMudanca(r) && <p className="text-ink-2">{resumoMudanca(r)}</p>}
                {r.motivo && <p className="text-muted">Motivo: {r.motivo}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{rotulo}</dt>
      <dd className="font-semibold text-ink">{valor}</dd>
    </div>
  );
}

function FormAjuste({ conta: c, onFechar }: { conta: Conta; onFechar: () => void }) {
  const id = useId();
  const router = useRouter();
  const [plano, setPlano] = useState(c.plano);
  const [creditos, setCreditos] = useState(String(c.creditos_desbloqueio));
  const [buscas, setBuscas] = useState(String(c.buscas_restantes));
  const [validoAte, setValidoAte] = useState(ultimoDia(c.plano_valido_ate));
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: c.id,
          plano,
          creditos: Number(creditos),
          buscas: Number(buscas),
          validoAte: plano === "gratis" ? null : validoAte || null,
          motivo,
        }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(corpo.erro || "Não foi possível salvar.");
      onFechar();
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="mt-4 space-y-4 border-t border-line-2 pt-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor={`${id}-plano`} className={ROTULO}>Plano</label>
          <select id={`${id}-plano`} className={CAMPO} value={plano} onChange={(e) => setPlano(e.target.value)}>
            <option value="gratis">Grátis</option>
            <option value="solo">Solo</option>
            <option value="pro">Pro</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-valido`} className={ROTULO}>Válido até (último dia)</label>
          <input
            id={`${id}-valido`}
            type="date"
            disabled={plano === "gratis"}
            className={CAMPO}
            value={plano === "gratis" ? "" : validoAte}
            onChange={(e) => setValidoAte(e.target.value)}
          />
          {plano !== "gratis" && !validoAte && <p className="mt-1 text-xs text-muted">Vazio = sem data de fim (cortesia).</p>}
        </div>
        <div>
          <label htmlFor={`${id}-creditos`} className={ROTULO}>Desbloqueios</label>
          <input id={`${id}-creditos`} type="number" min={0} max={100000} step={1} required inputMode="numeric" className={CAMPO} value={creditos} onChange={(e) => setCreditos(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-buscas`} className={ROTULO}>Buscas</label>
          <input id={`${id}-buscas`} type="number" min={0} max={100000} step={1} required inputMode="numeric" className={CAMPO} value={buscas} onChange={(e) => setBuscas(e.target.value)} />
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-motivo`} className={ROTULO}>Motivo (fica registrado na auditoria)</label>
        <input id={`${id}-motivo`} required minLength={3} maxLength={500} className={CAMPO} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      {c.assinatura_status === "ativa" && (
        <p className="text-xs text-muted">
          Esta conta tem assinatura ativa: na próxima mensalidade paga, o plano e o saldo voltam ao que foi pago.
        </p>
      )}
      {erro && <p role="alert" className={ALERTA_ERRO}>{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={enviando} onClick={onFechar} className={BOTAO_SECUNDARIO}>Cancelar</button>
        <button type="submit" disabled={enviando} className={BOTAO}>{enviando ? "Salvando…" : "Salvar ajuste"}</button>
      </div>
    </form>
  );
}
