import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SEM_INDEXACAO } from "@/lib/site";
import { lerPerfil } from "@/lib/perfil/dados";
import BoasVindasClient from "./BoasVindasClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Boas-vindas", robots: SEM_INDEXACAO };

// Primeiro acesso depois do cadastro: escolher apelido e avatar.
// Quem já concluiu (ou pulou) volta direto para o painel.
export default async function BoasVindasPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { perfil } = await lerPerfil(supabase, user.id);
  if (!perfil || perfil.configuracaoConcluida) redirect("/painel/buscar");

  return (
    <BoasVindasClient
      userId={user.id}
      apelidoInicial={perfil.apelido ?? ""}
      fotoUrl={perfil.fotoUrl}
      avatarPronto={perfil.avatarPronto}
    />
  );
}
