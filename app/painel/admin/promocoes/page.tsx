import { exigirAdminPagina } from "@/lib/admin/acesso";
import { MSG_FALTA_ETAPA19, faltaEtapa19 } from "@/lib/pagamentos/cupons";
import { FalhaCarregar } from "../comum";
import PromocoesClient, { type Cupom, type RegistroAuditoria } from "./PromocoesClient";

export const dynamic = "force-dynamic";

// Gestão > Promoções: cupons de desconto para os planos, o piso de preço
// e o resultado de cada campanha. Só administrador (layout + proxy +
// funções SQL que conferem eh_admin).
export default async function PromocoesPage() {
  const supabase = await exigirAdminPagina();

  const { data, error } = await supabase.rpc("admin_listar_cupons");
  if (error) {
    if (faltaEtapa19(error.code)) return <p className="text-ink-2">{MSG_FALTA_ETAPA19}</p>;
    return <FalhaCarregar error={error} />;
  }

  // Auditoria dos cupons: quem criou, editou, pausou ou mudou o piso.
  const { data: auditoria } = await supabase
    .from("admin_auditoria")
    .select("id, admin_email, acao, antes, depois, criado_em")
    .like("acao", "cupom%")
    .order("criado_em", { ascending: false })
    .limit(30);

  const lista = data as { piso: number; cupons: Cupom[] };
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  return (
    <PromocoesClient
      piso={Number(lista.piso)}
      cupons={lista.cupons ?? []}
      auditoria={(auditoria ?? []) as RegistroAuditoria[]}
      hoje={hoje}
    />
  );
}
