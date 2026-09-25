import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lerPerfil } from "@/lib/perfil/dados";
import PerfilClient from "./PerfilClient";

export const dynamic = "force-dynamic";

export default async function PerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink">Perfil</h1>
        <p className="mt-2 text-ink-2">Supabase não configurado neste ambiente.</p>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { perfil, pendente } = await lerPerfil(supabase, user.id);
  const aviso = (await searchParams).email;

  return (
    <PerfilClient
      userId={user.id}
      email={user.email ?? ""}
      // Enquanto a troca de e-mail não é confirmada, o Supabase guarda o
      // endereço novo em "new_email" e o login continua com o antigo.
      emailPendente={user.new_email ?? null}
      avisoEmail={aviso === "confirmado" || aviso === "parcial" ? aviso : null}
      perfil={perfil}
      pendente={pendente}
    />
  );
}
