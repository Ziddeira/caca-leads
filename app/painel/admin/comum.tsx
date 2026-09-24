import type { ReactNode } from "react";
import { CARTAO } from "@/components/ui";
import { MSG_FALTA_ETAPA11, faltaEtapa11 } from "@/lib/admin/acesso";

// Peças repetidas nas telas da Administração.

export function Numero({ rotulo, valor, dica }: { rotulo: string; valor: ReactNode; dica?: ReactNode }) {
  return (
    <div className={`${CARTAO} p-4`}>
      <p className="text-sm font-semibold text-ink-2">{rotulo}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums text-ink">{valor}</p>
      {dica && <p className="mt-1 text-xs text-muted">{dica}</p>}
    </div>
  );
}

export function Secao({ titulo, descricao, children }: { titulo: string; descricao?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-lg font-bold text-ink">{titulo}</h2>
      {descricao && <p className="mt-0.5 text-sm text-ink-2">{descricao}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// Mensagem quando a consulta falhou: script não rodado ou erro qualquer.
export function FalhaCarregar({ error }: { error: { code?: string; message: string } }) {
  if (faltaEtapa11(error.code)) return <p className="text-ink-2">{MSG_FALTA_ETAPA11}</p>;
  console.error("[admin]", error.code, error.message);
  return <p className="text-ink-2">Não foi possível carregar agora. Tente de novo em instantes.</p>;
}

// Tabela que rola para o lado no celular, sem empurrar a página.
export function Tabela({ children }: { children: ReactNode }) {
  return (
    <div className={`${CARTAO} overflow-x-auto`}>
      <table className="w-full min-w-[36rem] text-left text-sm [&_td]:border-t [&_td]:border-line-2 [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2.5 [&_th]:font-semibold [&_th]:text-ink-2">
        {children}
      </table>
    </div>
  );
}

const FUSO = "America/Sao_Paulo";

export function dataHora(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" });
}

export function data(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: FUSO });
}

// "2026-09-24" (data sem hora) → "24/09/2026".
export function dataDoDia(aaaammdd: string | null) {
  if (!aaaammdd) return "—";
  const [a, m, d] = aaaammdd.split("-");
  return `${d}/${m}/${a}`;
}

export function inteiro(n: number) {
  return n.toLocaleString("pt-BR");
}

export const NOME_PLANO: Record<string, string> = { gratis: "Grátis", solo: "Solo", pro: "Pro" };
