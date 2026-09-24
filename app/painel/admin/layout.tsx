import { exigirAdminPagina } from "@/lib/admin/acesso";
import { TituloPagina } from "@/components/ui";
import AbasAdmin from "./AbasAdmin";

export const dynamic = "force-dynamic";

// Tudo dentro de /painel/admin passa por aqui. Quem não é administrador
// já leva 403 no proxy; se chegar até aqui mesmo assim, recebe 404.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigirAdminPagina();
  return (
    <div>
      <TituloPagina titulo="Administração" />
      <AbasAdmin />
      {children}
    </div>
  );
}
