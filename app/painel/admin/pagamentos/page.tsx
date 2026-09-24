import { exigirAdminPagina } from "@/lib/admin/acesso";
import { formatarPreco } from "@/lib/planos";
import { ALERTA_ERRO } from "@/components/ui";
import { FalhaCarregar, Secao, Tabela, dataHora } from "../comum";

export const dynamic = "force-dynamic";

interface Evento {
  id: number;
  recebido_em: string;
  evento: string;
  valor: number | null;
  forma_pagamento: string | null;
  status_pagamento: string | null;
  resultado: string | null;
  user_id: string | null;
  email: string | null;
  apelido: string | null;
}

// Nomes dos eventos do Asaas em português simples.
const NOME_EVENTO: Record<string, string> = {
  PAYMENT_CREATED: "Cobrança criada",
  PAYMENT_UPDATED: "Cobrança alterada",
  PAYMENT_CONFIRMED: "Pagamento confirmado",
  PAYMENT_RECEIVED: "Pagamento recebido",
  PAYMENT_OVERDUE: "Pagamento vencido",
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: "Cartão recusado",
  PAYMENT_REPROVED_BY_RISK_ANALYSIS: "Reprovado na análise de risco",
  PAYMENT_REFUNDED: "Estornado",
  PAYMENT_CHARGEBACK_REQUESTED: "Contestação (chargeback)",
  PAYMENT_DELETED: "Cobrança apagada",
  SUBSCRIPTION_CREATED: "Assinatura criada",
  SUBSCRIPTION_UPDATED: "Assinatura alterada",
  SUBSCRIPTION_DELETED: "Assinatura cancelada",
  SUBSCRIPTION_INACTIVATED: "Assinatura inativada",
};

const RECUSADOS = new Set(["PAYMENT_CREDIT_CARD_CAPTURE_REFUSED", "PAYMENT_REPROVED_BY_RISK_ANALYSIS", "PAYMENT_OVERDUE"]);
const CANCELADOS = new Set(["SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"]);
const PROBLEMAS = new Set([...RECUSADOS, ...CANCELADOS, "PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED"]);

const DIAS_ALERTA = 30;

// Eventos a partir deste instante entram no aviso destacado.
function inicioDoAlerta() {
  return Date.now() - DIAS_ALERTA * 86_400_000;
}

// Gestão > Pagamentos: eventos recebidos do Asaas pelo webhook
// (tabela pagamentos_eventos, etapa 3).
export default async function PagamentosPage() {
  const supabase = await exigirAdminPagina();
  const { data, error } = await supabase.rpc("admin_pagamentos", { p_limite: 200 });
  if (error) return <FalhaCarregar error={error} />;
  const eventos = (data ?? []) as Evento[];

  const limite = inicioDoAlerta();
  const recentes = eventos.filter((e) => new Date(e.recebido_em).getTime() >= limite);
  const recusados = recentes.filter((e) => RECUSADOS.has(e.evento)).length;
  const cancelados = recentes.filter((e) => CANCELADOS.has(e.evento)).length;

  return (
    <div>
      {(recusados > 0 || cancelados > 0) && (
        <div role="alert" className={`${ALERTA_ERRO} mb-6 text-base`}>
          <strong>Atenção nos últimos {DIAS_ALERTA} dias:</strong>{" "}
          {[
            recusados && `${recusados} pagamento(s) recusado(s) ou vencido(s)`,
            cancelados && `${cancelados} assinatura(s) cancelada(s)`,
          ]
            .filter(Boolean)
            .join(" e ")}
          . As linhas estão destacadas em vermelho abaixo.
        </div>
      )}

      <Secao titulo="Eventos recebidos do Asaas" descricao="Os 200 mais recentes, do mais novo para o mais antigo.">
        {eventos.length === 0 ? (
          <p className="text-sm text-ink-2">Nenhum evento recebido ainda.</p>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th className="text-right">Valor</th>
                <th>Usuário</th>
                <th>O que o sistema fez</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => {
                const problema = PROBLEMAS.has(e.evento);
                return (
                  <tr key={e.id} className={problema ? "bg-danger-soft" : undefined}>
                    <td className="whitespace-nowrap">{dataHora(e.recebido_em)}</td>
                    <td>
                      <span className={`block font-semibold ${problema ? "text-danger" : "text-ink"}`}>
                        {problema && "⚠ "}
                        {NOME_EVENTO[e.evento] ?? e.evento}
                      </span>
                      <span className="block text-xs text-muted">
                        {e.evento}
                        {e.forma_pagamento && ` · ${e.forma_pagamento === "CREDIT_CARD" ? "cartão" : e.forma_pagamento}`}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {e.valor === null ? "—" : formatarPreco(Number(e.valor))}
                    </td>
                    <td>
                      {e.user_id ? (
                        <>
                          <span className="block text-ink">{e.apelido ?? "—"}</span>
                          <span className="block text-xs text-muted">{e.email ?? "sem e-mail"}</span>
                        </>
                      ) : (
                        <span className="text-muted">não identificado</span>
                      )}
                    </td>
                    <td className="text-xs text-ink-2">{e.resultado ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
        )}
      </Secao>
    </div>
  );
}
