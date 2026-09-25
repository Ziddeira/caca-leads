import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MENSAGENS_BUCKET, MSG_FALTA_ETAPA16, faltaEtapa16, type CodigoChat } from "./regras";

// Peças comuns das rotas /api/mensagens/*. Toda regra (quem participa,
// plano, limites, bloqueio, suspensão) é conferida pelas funções SQL da
// etapa 16; aqui se confere o login (exigirUsuario, da Comunidade), o
// conteúdo da imagem, e se traduz o erro do banco numa resposta.

const CODIGOS: Record<string, { status: number; codigo: CodigoChat }> = {
  AP402: { status: 402, codigo: "assinar" },
  AP423: { status: 423, codigo: "suspenso" },
  AP428: { status: 428, codigo: "regras" },
  AP429: { status: 429, codigo: "limite" },
};

export function respostaErroChat(error: { code?: string; message: string }, contexto: string) {
  const proprio = error.code ? CODIGOS[error.code] : undefined;
  if (proprio) {
    return NextResponse.json({ erro: error.message, codigo: proprio.codigo }, { status: proprio.status });
  }
  if (faltaEtapa16(error.code)) {
    console.error(`[${contexto}] Etapa 16 não encontrada:`, error.code, error.message);
    return NextResponse.json({ erro: `${MSG_FALTA_ETAPA16} (código: ${error.code})` }, { status: 503 });
  }
  if (error.code === "P0001" || error.code === "23514") {
    return NextResponse.json({ erro: error.message }, { status: 400 });
  }
  console.error(`[${contexto}]`, error.code, error.message);
  return NextResponse.json({ erro: "Não foi possível concluir agora. Tente de novo em instantes." }, { status: 500 });
}

// Caminho da imagem: "<conversa>/<id do usuário>/<data>-<sorteio>.<webp|jpg>"
// (o banco confere exatamente esse formato de novo).
export function caminhoImagemValido(path: string, conversa: number, userId: string) {
  const re = new RegExp(`^${conversa}/${userId}/[0-9]{10,16}-[a-z0-9]{4,16}\\.(webp|jpg)$`);
  return re.test(path);
}

// Confere o CONTEÚDO do arquivo (os primeiros bytes), não só o nome ou o
// tipo informado pelo navegador: tem de ser mesmo um WEBP ou um JPG,
// igual à extensão. Um executável renomeado para ".webp" é recusado.
// Usa a sessão do próprio usuário: pelas regras do bucket, ele só
// consegue ler imagens das próprias conversas.
export async function imagemVerdadeira(supabase: SupabaseClient, path: string): Promise<boolean> {
  const { data, error } = await supabase.storage.from(MENSAGENS_BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return false;
  try {
    const res = await fetch(data.signedUrl, { headers: { Range: "bytes=0-15" }, cache: "no-store" });
    if (!res.ok) return false;
    const b = new Uint8Array(await res.arrayBuffer()).subarray(0, 16);
    const ascii = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
    if (path.endsWith(".webp")) return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
    if (path.endsWith(".jpg")) return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    return false;
  } catch {
    return false;
  }
}

export async function apagarImagemChat(supabase: SupabaseClient, path: string) {
  const { error } = await supabase.storage.from(MENSAGENS_BUCKET).remove([path]);
  if (error) console.error("[mensagens] Falha ao apagar imagem:", error.message);
}
