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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: perfil } = user
    ? await supabase
        .from("profiles")
        .select("plano, buscas_restantes, creditos_desbloqueio")
        .eq("id", user.id)
        .single()
    : { data: null };

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
