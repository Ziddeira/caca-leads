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

  // Preferência da Comunidade. Sem o script da etapa 14 a coluna não
  // existe (null): o cartão avisa em vez de quebrar a página.
  const { data: comunidade, error: erroComunidade } = await supabase
    .from("profiles")
    .select("mostrar_vendas_comunidade")
    .eq("id", user.id)
    .maybeSingle();
  const mostrarVendas = erroComunidade ? null : !!comunidade?.mostrar_vendas_comunidade;

  // Formas de entrar. O Google aparece nas identidades da conta. A senha
  // vem da função "tem_senha" (etapa 17), que também pega quem entrou
  // pelo Google e depois criou senha pelo "Esqueci minha senha"; sem o
  // script, vale ter a identidade de e-mail (cadastro com senha).
  const provedores = new Set([
    ...(user.identities ?? []).map((i) => i.provider),
    ...((user.app_metadata.providers as string[] | undefined) ?? []),
  ]);
  const { data: temSenha, error: erroSenha } = await supabase.rpc("tem_senha");
  const acesso = {
    senha: erroSenha ? provedores.has("email") : temSenha === true,
    google: provedores.has("google"),
  };

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
      mostrarVendas={mostrarVendas}
      acesso={acesso}
    />
  );
}
