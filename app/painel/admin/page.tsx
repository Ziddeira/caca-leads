import { exigirAdminPagina } from "@/lib/admin/acesso";
import { formatarPreco } from "@/lib/planos";
import { FalhaCarregar, Numero, Secao, inteiro } from "./comum";

export const dynamic = "force-dynamic";

interface VisaoGeral {
  contas_total: number;
  contas_gratis: number;
  assinantes_por_plano: { solo: number; pro: number };
  novos_cadastros_mes: number;
  assinaturas_ativas: number;
  assinaturas_inadimplentes: number;
  receita_mensal_recorrente: number;
  receita_em_risco: number;
  recebido_no_mes: number;
  cancelamentos_mes: number;
  contas_que_pagaram: number;
  novos_assinantes_mes: number;
}

function porcento(parte: number, total: number) {
  if (!total) return "—";
  return (parte / total).toLocaleString("pt-BR", { style: "percent", maximumFractionDigits: 1 });
}

// Administração > Visão geral. Todos os números vêm da função SQL
// admin_visao_geral (etapa 11), que recusa quem não é administrador.
export default async function VisaoGeralPage() {
  const supabase = await exigirAdminPagina();
  const { data, error } = await supabase.rpc("admin_visao_geral");
  if (error) return <FalhaCarregar error={error} />;
  const v = data as VisaoGeral;
  const pagantes = v.assinantes_por_plano.solo + v.assinantes_por_plano.pro;

  return (
    <div>
      <Secao titulo="Assinantes ativos" descricao="Contas com plano pago ainda válido.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Numero rotulo="Solo" valor={inteiro(v.assinantes_por_plano.solo)} />
          <Numero rotulo="Pro" valor={inteiro(v.assinantes_por_plano.pro)} />
          <Numero rotulo="Total pagante" valor={inteiro(pagantes)} />
          <Numero rotulo="Grátis" valor={inteiro(v.contas_gratis)} dica={`de ${inteiro(v.contas_total)} contas`} />
        </div>
      </Secao>

      <Secao titulo="Dinheiro">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Numero
            rotulo="Receita mensal recorrente"
            valor={formatarPreco(Number(v.receita_mensal_recorrente))}
            dica={`${inteiro(v.assinaturas_ativas)} assinatura(s) ativa(s) no Asaas`}
          />
          <Numero
            rotulo="Em risco (pagamento atrasado)"
            valor={formatarPreco(Number(v.receita_em_risco))}
            dica={`${inteiro(v.assinaturas_inadimplentes)} assinatura(s) inadimplente(s)`}
          />
          <Numero rotulo="Recebido neste mês" valor={formatarPreco(Number(v.recebido_no_mes))} dica="Mensalidades e pacotes, sem estornos" />
        </div>
      </Secao>

      <Secao titulo="Neste mês">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Numero rotulo="Novos cadastros" valor={inteiro(v.novos_cadastros_mes)} />
          <Numero rotulo="Novos assinantes" valor={inteiro(v.novos_assinantes_mes)} dica="Primeira mensalidade paga neste mês" />
          <Numero rotulo="Cancelamentos" valor={inteiro(v.cancelamentos_mes)} dica="Assinaturas canceladas neste mês" />
        </div>
      </Secao>

      <Secao titulo="Conversão de grátis para pago">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Numero
            rotulo="Contas que já pagaram"
            valor={porcento(v.contas_que_pagaram, v.contas_total)}
            dica={`${inteiro(v.contas_que_pagaram)} de ${inteiro(v.contas_total)} contas já tiveram uma mensalidade paga`}
          />
          <Numero
            rotulo="Pagando agora"
            valor={porcento(pagantes, v.contas_total)}
            dica={`${inteiro(pagantes)} de ${inteiro(v.contas_total)} contas estão num plano pago`}
          />
        </div>
      </Secao>
    </div>
  );
}
