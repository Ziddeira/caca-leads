import { exigirAdminPagina } from "@/lib/admin/acesso";
import { FalhaCarregar } from "../comum";
import AvisosClient, { type Aviso } from "./AvisosClient";

export const dynamic = "force-dynamic";

// Administração > Avisos: mensagens do sino escritas por você.
export default async function AvisosPage() {
  const supabase = await exigirAdminPagina();
  const { data, error } = await supabase.rpc("admin_listar_avisos");
  if (error) return <FalhaCarregar error={error} />;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return <AvisosClient avisos={(data ?? []) as Aviso[]} hoje={hoje} />;
}
