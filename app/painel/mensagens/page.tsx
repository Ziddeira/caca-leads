import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TituloPagina } from "@/components/ui";
import { ChatProvider } from "@/components/mensagens/Contexto";
import ListaConversas from "@/components/mensagens/ListaConversas";
import { MSG_FALTA_ETAPA16, faltaEtapa16 } from "@/lib/mensagens/regras";
import type { Conversa, EstadoChat } from "@/lib/mensagens/tipos";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mensagens" };

// Mensagens (chat privado): lista de conversas e pedidos. Cada um só lê
// as próprias conversas — quem garante é o RLS do banco (etapa 16).
export default async function MensagensPage() {
  const supabase = await createClient();
  if (!supabase) return <Aviso texto="Supabase não configurado neste ambiente." />;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [estado, lista] = await Promise.all([supabase.rpc("chat_meu_estado"), supabase.rpc("chat_lista")]);
  const falha = estado.error ?? lista.error;
  if (falha || !estado.data) {
    if (!faltaEtapa16(falha?.code)) console.error("[mensagens]", falha?.code, falha?.message);
    return <Aviso texto={faltaEtapa16(falha?.code) ? MSG_FALTA_ETAPA16 : "Não foi possível carregar as mensagens agora."} />;
  }
  const e = estado.data as EstadoChat;

  return (
    <div className="mx-auto max-w-2xl">
      <TituloPagina titulo="Mensagens" descricao="Conversas privadas com outras pessoas da comunidade.">
        <Link
          href="/painel/mensagens/bloqueados"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-2 hover:text-ink"
        >
          Bloqueados
        </Link>
      </TituloPagina>
      <div className="mt-6">
        <ChatProvider regrasAceitas={e.regras_aceitas}>
          <ListaConversas inicial={(lista.data ?? []) as Conversa[]} estado={e} />
        </ChatProvider>
      </div>
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div>
      <TituloPagina titulo="Mensagens" />
      <p className="mt-4 text-ink-2">{texto}</p>
    </div>
  );
}
