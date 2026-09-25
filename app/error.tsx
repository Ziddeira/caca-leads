"use client";

// Erro inesperado em qualquer tela (o "500" do app). Tentar de novo
// refaz a tela; o erro vai para o console para aparecer nos logs.
import Link from "next/link";
import { useEffect } from "react";
import TelaStatus from "@/components/marca/TelaStatus";
import { BOTAO, BOTAO_SECUNDARIO } from "@/components/ui";

export default function ErroInesperado({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <TelaStatus
      codigo="500"
      expressao="triste"
      titulo="Algo deu errado por aqui"
      texto="Tivemos um problema para abrir esta tela. Tente de novo em instantes; se continuar, use o botão “Preciso de ajuda” no painel."
    >
      <button type="button" onClick={() => retry()} className={BOTAO}>
        Tentar de novo
      </button>
      <Link href="/" className={BOTAO_SECUNDARIO}>
        Voltar ao início
      </Link>
    </TelaStatus>
  );
}
