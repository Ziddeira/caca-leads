import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SEM_INDEXACAO } from "@/lib/site";
import TelaAuth, { LINK_AUTH } from "@/components/TelaAuth";
import { ALERTA_ERRO } from "@/components/ui";
import FormRedefinirSenha from "./FormRedefinirSenha";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Criar senha nova", robots: SEM_INDEXACAO };

// Chega aqui pelo link de "esqueci minha senha": o /auth/callback já
// validou o link e abriu a sessão. Sem sessão, o link expirou.
export default async function RedefinirSenhaPage() {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  return (
    <TelaAuth
      titulo="Criar senha nova"
      descricao={user?.email ? <>Conta: {user.email}</> : "Link de recuperação de senha."}
    >
      {user ? (
        <FormRedefinirSenha />
      ) : (
        <>
          <p role="alert" className={`${ALERTA_ERRO} mt-6`}>
            Este link expirou ou já foi usado. Peça um link novo.
          </p>
          <p className="mt-6 text-center text-sm">
            <Link href="/esqueci-senha" className={LINK_AUTH}>
              Pedir outro link
            </Link>
          </p>
        </>
      )}
    </TelaAuth>
  );
}
