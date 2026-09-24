import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MSG_FALTA_ETAPA12, ehAssunto, faltaEtapa12, DESCRICAO_MAX, SUPORTE_BUCKET } from "@/lib/suporte/regras";
import { enviarCopiaChamado } from "@/lib/suporte/email";

export const dynamic = "force-dynamic";

// Abrir chamado ("Preciso de ajuda"). A imagem, se houver, já foi enviada
// pelo navegador direto para o bucket privado "suporte" (pasta do próprio
// usuário, até 5 MB, só imagem — regras do bucket). A função SQL
// abrir_chamado confere o limite de 5 abertos, o arquivo e preenche os
// dados da conta (e-mail, plano, saldo) pelo próprio banco.
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ erro: "Supabase não configurado neste ambiente." }, { status: 500 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "É preciso estar logado." }, { status: 401 });
  }

  const corpo = await request.json().catch(() => null);
  const assunto = corpo?.assunto;
  const descricao = typeof corpo?.descricao === "string" ? corpo.descricao.trim() : "";
  const anexo = typeof corpo?.anexo === "string" && corpo.anexo ? corpo.anexo : null;
  const pagina = typeof corpo?.pagina === "string" ? corpo.pagina.slice(0, 300) : null;
  // O navegador vem do cabeçalho da própria requisição (não do formulário).
  const navegador = request.headers.get("user-agent")?.slice(0, 500) ?? null;

  if (!ehAssunto(assunto)) {
    return NextResponse.json({ erro: "Escolha o assunto." }, { status: 400 });
  }
  if (!descricao) {
    return NextResponse.json({ erro: "Descreva o que aconteceu." }, { status: 400 });
  }
  if (descricao.length > DESCRICAO_MAX) {
    return NextResponse.json({ erro: `A descrição pode ter no máximo ${DESCRICAO_MAX} caracteres.` }, { status: 400 });
  }

  const { data: id, error } = await supabase.rpc("abrir_chamado", {
    p_assunto: assunto,
    p_descricao: descricao,
    p_anexo_path: anexo,
    p_pagina: pagina,
    p_navegador: navegador,
  });

  if (error) {
    // O chamado não foi criado: apaga a imagem que ficou sem dono.
    if (anexo?.startsWith(`${user.id}/`)) {
      await createAdminClient()?.storage.from(SUPORTE_BUCKET).remove([anexo]);
    }
    if (faltaEtapa12(error.code)) {
      console.error("[suporte] Etapa 12 não encontrada:", error.code, error.message);
      return NextResponse.json({ erro: `${MSG_FALTA_ETAPA12} (código: ${error.code})` }, { status: 503 });
    }
    if (error.code === "P0001" || error.code === "23514") {
      return NextResponse.json({ erro: error.message }, { status: 400 });
    }
    console.error("[suporte]", error.code, error.message);
    return NextResponse.json({ erro: "Não foi possível enviar agora. Tente de novo em instantes." }, { status: 500 });
  }

  // Cópia por e-mail: preparada, mas desligada (ver lib/suporte/email.ts).
  const { data: chamado } = await supabase.from("chamados").select("diagnostico").eq("id", id).single();
  await enviarCopiaChamado({
    id: Number(id),
    assunto,
    descricao,
    temAnexo: !!anexo,
    diagnostico: (chamado?.diagnostico as Record<string, unknown>) ?? {},
  });

  return NextResponse.json({ id });
}
