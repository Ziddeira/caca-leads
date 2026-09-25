import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { NotificacoesProvider, Sino } from "@/components/notificacoes/Notificacoes";
import BotaoAjuda from "@/components/suporte/BotaoAjuda";
import { MensagensProvider } from "@/components/mensagens/Resumo";
import TourArtemis from "@/components/tour/TourArtemis";
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

  // Link da tela de Gestão no menu (só para você). Sem o script da
  // etapa 8, a função não existe e o link simplesmente não aparece.
  const { data: ehAdmin } = await supabase.rpc("eh_admin");

  // Contador do sino. Sem o script da etapa 9, a tabela não existe e o
  // sino simplesmente não aparece.
  const { count: naoLidas, error: erroNotificacoes } = await supabase
    .from("notificacoes")
    .select("id", { count: "exact", head: true })
    .is("lida_em", null);

  // Número do item "Mensagens" (não lidas + pedidos recebidos). Sem o
  // script da etapa 16, a função não existe e o número não aparece.
  const { data: resumoMensagens, error: erroMensagens } = await supabase.rpc("chat_resumo");

  return (
    <NotificacoesProvider naoLidasInicial={erroNotificacoes ? null : (naoLidas ?? 0)}>
    <MensagensProvider
      inicial={erroMensagens || !resumoMensagens ? null : (resumoMensagens as { nao_lidas: number; pedidos: number })}
    >
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
          admin={ehAdmin === true}
        />
        {/* O espaço de baixo evita que o menu inferior fixo (celular) e o
            botão "Preciso de ajuda" cubram o fim da página (inclui a área
            segura do iPhone). */}
        <main
          id="conteudo"
          className="px-seguro min-w-0 flex-1 pt-6 pb-[calc(9rem+env(safe-area-inset-bottom))] sm:px-6 md:px-10 md:pt-10 md:pb-24"
        >
          <div className="mx-auto w-full max-w-6xl">
            {/* Computador: sino no canto superior direito. No celular ele
                fica na barra do topo (dentro do Sidebar). */}
            <div className="mb-2 hidden justify-end md:-mt-6 md:flex">
              <Sino />
            </div>
            {children}
          </div>
        </main>
        <BotaoAjuda />
        {/* Tour guiado da Ártemis: sozinho uma vez, logo depois das
            boas-vindas; depois, só pelo "Rever o tour" do Perfil. */}
        <TourArtemis concluido={perfil?.tourConcluido ?? true} />
      </div>
    </MensagensProvider>
    </NotificacoesProvider>
  );
}
