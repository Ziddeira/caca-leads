import { NextResponse } from "next/server";
import { exigirUsuario, lerId } from "@/lib/comunidade/servidor";
import {
  apagarImagemChat,
  caminhoImagemValido,
  imagemVerdadeira,
  respostaErroChat,
} from "@/lib/mensagens/servidor";
import { MENSAGEM_MAX } from "@/lib/mensagens/regras";

export const dynamic = "force-dynamic";

// Mensagens de uma conversa (?antes=<id> carrega as anteriores).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;
  const id = lerId((await params).id);
  if (!id) return NextResponse.json({ erro: "Conversa inválida." }, { status: 400 });
  const antes = lerId(new URL(request.url).searchParams.get("antes") ?? "");

  const { data, error } = await acesso.supabase.rpc("chat_mensagens_da_conversa", {
    p_conversa: id,
    p_antes: antes,
    p_limite: 40,
  });
  if (error) return respostaErroChat(error, "mensagens/ler");
  return NextResponse.json({ mensagens: data ?? [] });
}

// Enviar mensagem: texto (até 1000 caracteres) e/ou imagem. A imagem já
// foi enviada pelo navegador ao bucket privado "mensagens" (a regra do
// bucket só deixa enviar em conversa aberta). Aqui o servidor confere o
// conteúdo do arquivo; a função SQL chat_enviar confere o resto
// (aceite, bloqueio, suspensão, plano e limite por minuto).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirUsuario();
  if (acesso.resposta) return acesso.resposta;
  const { supabase, user } = acesso;
  const id = lerId((await params).id);
  if (!id) return NextResponse.json({ erro: "Conversa inválida." }, { status: 400 });

  const corpo = await request.json().catch(() => null);
  const texto = typeof corpo?.texto === "string" ? corpo.texto.trim() : "";
  const imagem = typeof corpo?.imagem === "string" && corpo.imagem ? corpo.imagem : null;
  const minha = imagem && caminhoImagemValido(imagem, id, user.id) ? imagem : null;

  const recusar = async (erro: string) => {
    if (minha) await apagarImagemChat(supabase, minha);
    return NextResponse.json({ erro }, { status: 400 });
  };
  if ([...texto].length > MENSAGEM_MAX) return recusar(`A mensagem pode ter no máximo ${MENSAGEM_MAX} caracteres.`);
  if (imagem && !minha) return recusar("Imagem inválida.");
  if (!texto && !imagem) return recusar("Escreva uma mensagem ou escolha uma imagem.");
  if (minha && !(await imagemVerdadeira(supabase, minha))) {
    return recusar("Esse arquivo não é uma imagem válida. Envie uma foto JPG, PNG ou WEBP.");
  }

  const { data, error } = await supabase.rpc("chat_enviar", { p_conversa: id, p_texto: texto, p_imagem: minha });
  if (error) {
    // A mensagem não foi criada: apaga a imagem que ficou sem uso.
    if (minha) await apagarImagemChat(supabase, minha);
    return respostaErroChat(error, "mensagens/enviar");
  }
  return NextResponse.json({ mensagem: data });
}
