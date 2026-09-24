// Peças usadas pelas telas de Perfil e de boas-vindas.
import { ALERTA_ERRO, ALERTA_SUCESSO } from "@/components/ui";

export type Mensagem = { tipo: "ok" | "erro"; texto: string } | null;

export function Alerta({ mensagem }: { mensagem: Mensagem }) {
  if (!mensagem) return null;
  return mensagem.tipo === "ok" ? (
    <p role="status" className={ALERTA_SUCESSO}>
      {mensagem.texto}
    </p>
  ) : (
    <p role="alert" className={ALERTA_ERRO}>
      {mensagem.texto}
    </p>
  );
}

// Chama uma rota /api/perfil/... e devolve a mensagem de erro, ou null
// se deu certo.
export async function chamar(url: string, metodo: string, corpo?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: corpo ? { "Content-Type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    if (res.ok) return null;
    const dados = await res.json().catch(() => ({}));
    return dados.erro || "Não foi possível salvar agora.";
  } catch {
    return "Não foi possível falar com o servidor agora.";
  }
}
