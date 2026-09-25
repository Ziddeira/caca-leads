"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconeMensagens } from "@/components/Icones";
import { ALERTA_ERRO, BOTAO, BOTAO_NEUTRO } from "@/components/ui";
import { chamarApi } from "@/components/comunidade/api";
import type { RelacaoChat } from "@/lib/mensagens/tipos";
import { ChatProvider, useChat } from "./Contexto";

// Botão no perfil público da comunidade: pedir conversa, ver o pedido ou
// abrir a conversa. Quem decide se pode (plano, limite, bloqueio) é o
// banco; aqui só se escolhe o que mostrar.
export default function BotaoConversar({ apelido, relacao }: { apelido: string; relacao: RelacaoChat }) {
  return (
    <ChatProvider regrasAceitas={false}>
      <Botao apelido={apelido} relacao={relacao} />
    </ChatProvider>
  );
}

function Botao({ apelido, relacao: r }: { apelido: string; relacao: RelacaoChat }) {
  const router = useRouter();
  const { executar } = useChat();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const link = r.conversa_id ? `/painel/mensagens/${r.conversa_id}` : null;

  async function pedir() {
    setErro(null);
    setEnviando(true);
    const res = await executar(() => chamarApi<{ conversa: number }>("/api/mensagens/conversas", "POST", { apelido }));
    setEnviando(false);
    if (!res.ok || !res.dados) return setErro(res.erro);
    router.push(`/painel/mensagens/${res.dados.conversa}`);
  }

  if (r.eu_bloqueei) {
    return (
      <p className="text-sm text-ink-2">
        Você bloqueou {apelido} nas mensagens.{" "}
        <Link href="/painel/mensagens/bloqueados" className="font-semibold text-primary hover:underline">
          Ver bloqueados
        </Link>
      </p>
    );
  }
  if (link && r.situacao === "aceita") {
    return (
      <Link href={link} className={BOTAO}>
        <IconeMensagens width={18} height={18} />
        Abrir conversa
      </Link>
    );
  }
  if (link && r.situacao === "pendente") {
    return (
      <Link href={link} className={BOTAO_NEUTRO}>
        <IconeMensagens width={18} height={18} />
        {r.eu_pedi ? "Pedido enviado" : "Responder pedido de conversa"}
      </Link>
    );
  }

  return (
    <div>
      <button type="button" onClick={pedir} disabled={enviando} className={BOTAO}>
        <IconeMensagens width={18} height={18} />
        {enviando ? "Enviando…" : "Pedir conversa"}
      </button>
      <p className="mt-1.5 text-xs text-muted">
        {r.acesso_total
          ? `A conversa começa quando ${apelido} aceitar.`
          : "Iniciar conversas é do Solo e do Pro. No Grátis você responde pedidos."}
      </p>
      {erro && (
        <p role="alert" className={`${ALERTA_ERRO} mt-2`}>
          {erro}
        </p>
      )}
    </div>
  );
}
