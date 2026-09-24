import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/server";
import { lerPerfil } from "@/lib/perfil/dados";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-6 text-center">
        <div className="max-w-md rounded-lg border border-line bg-surface p-8 shadow-cartao">
          <h1 className="text-lg font-bold text-ink">Configuração pendente</h1>
          <p className="mt-2 text-sm text-ink-2">
            As variáveis NEXT_PUBLIC_SUPABASE_URL e
            NEXT_PUBLIC_SUPABASE_ANON_KEY ainda não estão configuradas neste
            ambiente.
          </p>
        </div>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Apelido e foto para o menu. Se o script da etapa 5 ainda não foi
  // rodado, o menu só mostra o e-mail, como antes.
  const { perfil } = await lerPerfil(supabase, user.id);

  // Primeiro acesso: antes do painel, a tela de boas-vindas (apelido e
  // avatar). Aparece uma vez só; quem já tinha conta está marcado como
  // concluído pelo script da etapa 6.
  if (perfil && !perfil.configuracaoConcluida) {
    redirect("/boas-vindas");
  }

  return (
    <div className="min-h-screen bg-canvas md:flex">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-primary px-4 py-3 font-semibold text-primary-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Pular para o conteúdo
      </a>
      <Sidebar
        email={user.email ?? null}
        apelido={perfil?.apelido ?? null}
        fotoUrl={perfil?.fotoUrl ?? null}
        avatarPronto={perfil?.avatarPronto ?? null}
      />
      {/* No celular, o espaço de baixo evita que o menu inferior fixo
          cubra o fim da página (inclui a área segura do iPhone). */}
      <main
        id="conteudo"
        className="px-seguro min-w-0 flex-1 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 md:px-10 md:py-10"
      >
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
