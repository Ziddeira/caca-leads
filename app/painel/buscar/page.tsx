import { createClient } from "@/lib/supabase/server";
import BuscaClient from "./BuscaClient";

export const dynamic = "force-dynamic";

export default async function BuscarPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Buscar</h1>
        <p className="mt-2 text-ink-2">Supabase não configurado neste ambiente.</p>
      </div>
    );
  }

  // "meu_plano" aplica o vencimento do plano (volta ao Grátis se o ciclo
  // pago acabou sem renovação) antes de devolver plano e saldo.
  const { data: perfil } = await supabase
    .rpc("meu_plano")
    .single<{ plano: string; buscas_restantes: number; creditos_desbloqueio: number }>();

  return (
    <BuscaClient
      perfilInicial={{
        plano: perfil?.plano ?? "gratis",
        buscasRestantes: perfil?.buscas_restantes ?? 0,
        creditosDesbloqueio: perfil?.creditos_desbloqueio ?? 0,
      }}
    />
  );
}
