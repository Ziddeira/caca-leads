import type { SupabaseClient, User } from "@supabase/supabase-js";
import { lerPerfil } from "./dados";
import { FOTO_BUCKET, FOTO_MAX_BYTES } from "./regras";

const EXTENSOES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Primeira entrada pelo Google: se a conta do Google tem foto, ela vira a
// foto inicial do perfil (a pessoa troca nas boas-vindas ou no Perfil).
// A foto é copiada para o nosso bucket, como uma foto enviada, para o
// resto do site não depender do link do Google.
// Só acontece antes de concluir as boas-vindas e se ainda não houver foto
// nem avatar pronto: quem já tinha conta e só ligou o Google fica como
// estava. Qualquer falha é ignorada — nunca atrapalha o login.
export async function importarFotoDoGoogle(supabase: SupabaseClient, user: User) {
  try {
    const link = linkDaFoto(user);
    if (!link) return;

    const { perfil } = await lerPerfil(supabase, user.id);
    if (!perfil || perfil.configuracaoConcluida || perfil.fotoPath || perfil.avatarPronto) return;

    const resposta = await fetch(link, { signal: AbortSignal.timeout(5000), redirect: "error" });
    const tipo = (resposta.headers.get("content-type") ?? "").split(";")[0].trim();
    const extensao = EXTENSOES[tipo];
    if (!resposta.ok || !extensao) return;

    const arquivo = await resposta.arrayBuffer();
    if (arquivo.byteLength === 0 || arquivo.byteLength > FOTO_MAX_BYTES) return;

    const path = `${user.id}/google-${Date.now()}.${extensao}`;
    const { error: erroEnvio } = await supabase.storage
      .from(FOTO_BUCKET)
      .upload(path, arquivo, { contentType: tipo, upsert: false });
    if (erroEnvio) {
      console.error("[perfil/foto-google] Falha ao enviar foto:", erroEnvio.message);
      return;
    }

    const { error } = await supabase.rpc("definir_foto_perfil", { p_path: path });
    if (error) {
      console.error("[perfil/foto-google] Falha ao gravar foto:", error.code, error.message);
      await supabase.storage.from(FOTO_BUCKET).remove([path]);
    }
  } catch (e) {
    console.error("[perfil/foto-google] Foto do Google não importada:", e instanceof Error ? e.message : e);
  }
}

// Link da foto que o Google mandou no login. Só aceita os servidores de
// imagem do próprio Google (o servidor não baixa links de outro lugar) e
// pede a versão de 512 px, o mesmo tamanho das fotos enviadas pelo site.
function linkDaFoto(user: User): string | null {
  const identidade = user.identities?.find((i) => i.provider === "google");
  const dados = { ...user.user_metadata, ...identidade?.identity_data };
  const bruto = typeof dados.avatar_url === "string" ? dados.avatar_url : dados.picture;
  if (typeof bruto !== "string") return null;

  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".googleusercontent.com")) return null;

  // Formato usual: ".../foto=s96-c" (96 px, recortada em quadrado).
  url.pathname = url.pathname.replace(/=s\d+(-c)?$/, "=s512-c");
  return url.toString();
}
