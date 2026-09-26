import { createClient } from "@/lib/supabase/server";
import PlanoClient from "./PlanoClient";

export const dynamic = "force-dynamic";

export default async function PlanoPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink">Meu plano</h1>
        <p className="mt-2 text-ink-2">Supabase não configurado neste ambiente.</p>
      </div>
    );
  }

  // "meu_plano" aplica o vencimento (volta ao Grátis se o ciclo pago
  // acabou sem renovação) antes de devolver plano e saldo.
  const { data: perfil } = await supabase
    .rpc("meu_plano")
    .single<{
      plano: string;
      creditos_desbloqueio: number;
      buscas_restantes: number;
      plano_valido_ate: string | null;
      tem_cliente_asaas: boolean;
    }>();

  // Desbloqueios ganhos no rank (etapa 8). Já estão somados no saldo de
  // "meu_plano"; aqui é só para mostrar quantos são do prêmio.
  const { data: premio } = await supabase
    .from("profiles")
    .select("creditos_premio")
    .maybeSingle<{ creditos_premio: number }>();

  // A assinatura mais recente (viva ou a última cancelada).
  const { data: assinatura } = await supabase
    .from("assinaturas")
    .select("plano, status, forma_pagamento, link_pagamento")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Desconto de cupom da assinatura atual (etapa 19). Se o script ainda
  // não foi rodado, a consulta falha e a tela segue sem ele.
  const { data: desconto } = await supabase.rpc("meu_desconto").maybeSingle<{
    codigo: string;
    valor_cheio: number;
    valor_com_desconto: number;
    duracao_meses: number | null;
    ciclos_pagos: number;
    status: string;
    proxima_cobranca_cheia: string | null;
  }>();

  return (
    <PlanoClient
      perfil={{
        plano: perfil?.plano ?? "gratis",
        creditosDesbloqueio: perfil?.creditos_desbloqueio ?? 0,
        buscasRestantes: perfil?.buscas_restantes ?? 0,
        validoAte: perfil?.plano_valido_ate ?? null,
        temClienteAsaas: perfil?.tem_cliente_asaas ?? false,
        creditosPremio: premio?.creditos_premio ?? 0,
      }}
      assinatura={
        assinatura
          ? {
              plano: assinatura.plano,
              status: assinatura.status,
              forma: assinatura.forma_pagamento,
              link: assinatura.link_pagamento,
            }
          : null
      }
      desconto={
        desconto
          ? {
              codigo: desconto.codigo,
              valorCheio: Number(desconto.valor_cheio),
              valorComDesconto: Number(desconto.valor_com_desconto),
              duracaoMeses: desconto.duracao_meses,
              ciclosPagos: desconto.ciclos_pagos,
              status: desconto.status,
              proximaCobrancaCheia: desconto.proxima_cobranca_cheia,
            }
          : null
      }
    />
  );
}
