import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatProvider } from "@/components/mensagens/Contexto";
import Conversa from "@/components/mensagens/Conversa";
import { lerId } from "@/lib/comunidade/servidor";
import { MSG_FALTA_ETAPA16, faltaEtapa16 } from "@/lib/mensagens/regras";
import type { Conversa as TipoConversa, EstadoChat, Mensagem } from "@/lib/mensagens/tipos";

export const dynamic = "force-dynamic";

export const metadata = { title: "Conversa" };

// Uma conversa. Quem não participa recebe "não encontrada" (as funções
// SQL e o RLS recusam — nem o administrador abre por aqui).
export default async function ConversaPage({ params }: { params: Promise<{ id: string }> }) {
  const id = lerId((await params).id);
  if (!id) notFound();

  const supabase = await createClient();
  if (!supabase) notFound();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [estado, conversa, mensagens] = await Promise.all([
    supabase.rpc("chat_meu_estado"),
    supabase.rpc("chat_conversa", { p_conversa: id }),
    supabase.rpc("chat_mensagens_da_conversa", { p_conversa: id, p_limite: 40 }),
  ]);
  const falha = estado.error ?? conversa.error ?? mensagens.error;
  if (falha) {
    if (falha.code === "P0001") notFound();
    if (!faltaEtapa16(falha.code)) console.error("[mensagens/conversa]", falha.code, falha.message);
    return <p className="text-ink-2">{faltaEtapa16(falha.code) ? MSG_FALTA_ETAPA16 : "Não foi possível carregar agora."}</p>;
  }
  const e = estado.data as EstadoChat;

  return (
    <ChatProvider regrasAceitas={e.regras_aceitas}>
      <Conversa
        conversaInicial={conversa.data as TipoConversa}
        mensagensIniciais={(mensagens.data ?? []) as Mensagem[]}
        userId={user.id}
        estado={e}
      />
    </ChatProvider>
  );
}
