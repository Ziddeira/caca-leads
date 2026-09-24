import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MSG_FALTA_ETAPA5, MSG_FALTA_ETAPA6, faltaEtapa5 } from "@/lib/perfil/dados";
import { soDigitos, validarApelido, validarTelefone } from "@/lib/perfil/regras";

export const dynamic = "force-dynamic";

// Salva apelido e telefone do usuário logado. Quem grava de verdade é a
// função SQL "atualizar_perfil", que só mexe nessas duas colunas e sempre
// no perfil de quem está logado — plano, créditos e buscas ficam de fora.
export async function PATCH(request: Request) {
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
  const apelido = typeof corpo?.apelido === "string" ? corpo.apelido.trim() : "";
  // Sem o campo "telefone" (tela de boas-vindas), só o apelido muda e o
  // telefone salvo fica como está.
  const soApelido = !corpo || !("telefone" in corpo);
  const telefone = typeof corpo?.telefone === "string" ? soDigitos(corpo.telefone) : "";

  const erroValidacao = validarApelido(apelido) ?? (soApelido ? null : validarTelefone(telefone));
  if (erroValidacao) {
    return NextResponse.json({ erro: erroValidacao }, { status: 400 });
  }

  const { error } = soApelido
    ? await supabase.rpc("definir_apelido", { p_apelido: apelido })
    : await supabase.rpc("atualizar_perfil", { p_apelido: apelido, p_telefone: telefone || null });

  if (error) {
    if (faltaEtapa5(error.code)) {
      return NextResponse.json({ erro: soApelido ? MSG_FALTA_ETAPA6 : MSG_FALTA_ETAPA5 }, { status: 503 });
    }
    if (error.code === "23505") {
      return NextResponse.json({ erro: "Esse apelido já está em uso. Escolha outro." }, { status: 409 });
    }
    if (error.code === "23514" || error.code === "P0001") {
      return NextResponse.json({ erro: error.message }, { status: 400 });
    }
    console.error("[perfil] Falha ao salvar perfil:", error.code, error.message);
    return NextResponse.json({ erro: "Não foi possível salvar agora. Tente de novo em instantes." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
