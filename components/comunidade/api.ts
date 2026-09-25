// Chamada às rotas /api/comunidade/* a partir do navegador. Devolve os
// dados, a mensagem de erro e o "código" da comunidade (assinar, regras,
// suspenso, limite), que a tela usa para decidir o que mostrar.
import type { CodigoComunidade } from "@/lib/comunidade/regras";

export interface RespostaApi<T> {
  ok: boolean;
  dados: T | null;
  erro: string | null;
  codigo: CodigoComunidade | null;
}

export async function chamarApi<T>(url: string, metodo = "GET", corpo?: unknown): Promise<RespostaApi<T>> {
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: corpo !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    const dados = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, dados: dados as T, erro: null, codigo: null };
    return {
      ok: false,
      dados: null,
      erro: dados.erro || "Não foi possível concluir agora.",
      codigo: dados.codigo ?? null,
    };
  } catch {
    return { ok: false, dados: null, erro: "Não foi possível falar com o servidor agora.", codigo: null };
  }
}

// "há 5 min", "há 3 h", "ontem"… Depois de uma semana, a data.
export function tempoRelativo(iso: string) {
  const segundos = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (segundos < 60) return "agora";
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function dataHoraCompleta(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}
