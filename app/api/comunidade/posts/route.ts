import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apagarImagens, exigirUsuario, respostaErro } from "@/lib/comunidade/servidor";
import { lerPreviaLink } from "@/lib/comunidade/previa";
import { IMAGENS_MAX, TEXTO_MAX, ehCategoria, linkValido } from "@/lib/comunidade/regras";

export const dynamic = "force-dynamic";

// Publicar um post. As imagens (se houver) já foram enviadas pelo
// navegador para o bucket "comunidade", na pasta do próprio usuário — a
// regra do bucket só deixa Solo/Pro enviar. A função SQL
// comunidade_publicar confere de novo: regras aceitas, suspensão, plano,
// limite do dia, intervalo mínimo, tamanho do texto e as imagens.
export async function POST(request: Request) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;
  const { supabase, user } = acesso;

  const corpo = await request.json().catch(() => null);
  const texto = typeof corpo?.texto === "string" ? corpo.texto.trim() : "";
  const categoria = ehCategoria(corpo?.categoria) ? corpo.categoria : null;
  const link = typeof corpo?.link === "string" && corpo.link.trim() ? corpo.link.trim() : null;
  const imagens: string[] = Array.isArray(corpo?.imagens)
    ? corpo.imagens.filter((i: unknown): i is string => typeof i === "string" && i.length > 0 && i.length < 200)
    : [];
  // Só as imagens da própria pasta podem ser apagadas se algo der errado.
  const minhas = imagens.filter((i) => i.startsWith(`${user.id}/`));

  const recusar = async (erro: string) => {
    await apagarImagens(supabase, minhas);
    return NextResponse.json({ erro }, { status: 400 });
  };
  if ([...texto].length > TEXTO_MAX) return recusar(`O texto pode ter no máximo ${TEXTO_MAX} caracteres.`);
  if (imagens.length > IMAGENS_MAX) return recusar(`Dá para anexar no máximo ${IMAGENS_MAX} imagens.`);
  if (link && !linkValido(link)) return recusar("Link inválido. Use um endereço que comece com http:// ou https://.");
  if (!texto && !imagens.length) return recusar("Escreva algo ou anexe uma imagem.");

  const { data: id, error } = await supabase.rpc("comunidade_publicar", {
    p_texto: texto,
    p_categoria: categoria,
    p_imagens: imagens,
    p_link: link,
  });
  if (error) {
    // O post não foi criado: apaga as imagens que ficaram sem dono.
    await apagarImagens(supabase, minhas);
    return respostaErro(error, "comunidade/publicar");
  }

  // Prévia do link: lida aqui no servidor e gravada com a chave
  // service_role (o navegador não consegue gravar uma prévia falsa).
  if (link) {
    const admin = createAdminClient();
    const previa = admin ? await lerPreviaLink(link) : null;
    if (admin && previa) {
      const { error: erroPrevia } = await admin.rpc("comunidade_salvar_previa", { p_post: id, p_previa: previa });
      if (erroPrevia) console.error("[comunidade/previa]", erroPrevia.code, erroPrevia.message);
    }
  }

  const { data: post } = await supabase.rpc("comunidade_post", { p_id: id });
  return NextResponse.json({ post });
}
