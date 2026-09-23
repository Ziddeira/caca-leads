import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asaasConfigurado, criarCliente, ErroAsaas } from "./asaas";

type ClienteServidor = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type ClienteAdmin = NonNullable<ReturnType<typeof createAdminClient>>;

export interface Contexto {
  supabase: ClienteServidor;
  admin: ClienteAdmin;
  user: User;
}

export function erro(mensagem: string, status = 400) {
  return NextResponse.json({ erro: mensagem }, { status });
}

export function mensagemDeErro(e: unknown) {
  if (e instanceof ErroAsaas) return e.message;
  return "Erro inesperado ao falar com o Asaas. Tente de novo em instantes.";
}

// Confere configuração e login. Devolve o contexto ou a resposta de erro.
export async function prepararContexto(): Promise<Contexto | NextResponse> {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) {
    return erro("Supabase não configurado neste ambiente (falta SUPABASE_SERVICE_ROLE_KEY?).", 500);
  }
  if (!asaasConfigurado()) {
    return erro("ASAAS_API_KEY não configurada no servidor.", 500);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erro("É preciso estar logado.", 401);

  return { supabase, admin, user };
}

// Devolve o id do cliente no Asaas, criando-o na primeira compra.
export async function garantirClienteAsaas(
  ctx: Contexto,
  dados: { nome?: unknown; cpfCnpj?: unknown },
): Promise<string> {
  const { data: perfil } = await ctx.supabase
    .from("profiles")
    .select("asaas_customer_id")
    .eq("id", ctx.user.id)
    .single();

  if (perfil?.asaas_customer_id) return perfil.asaas_customer_id;

  const nome = typeof dados.nome === "string" ? dados.nome.trim() : "";
  const cpfCnpj = typeof dados.cpfCnpj === "string" ? dados.cpfCnpj.replace(/\D/g, "") : "";
  if (nome.length < 3) throw new ErroAsaas("Informe seu nome completo.");
  if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
    throw new ErroAsaas("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.");
  }

  const cliente = await criarCliente({
    nome,
    cpfCnpj,
    email: ctx.user.email ?? null,
    userId: ctx.user.id,
  });

  const { error } = await ctx.admin.rpc("salvar_cliente_asaas", {
    p_user_id: ctx.user.id,
    p_customer_id: cliente.id,
  });
  if (error) throw new Error(error.message);

  return cliente.id;
}

// A assinatura "viva" (não cancelada) do usuário, se houver.
export async function assinaturaViva(ctx: Contexto) {
  const { data } = await ctx.supabase
    .from("assinaturas")
    .select("asaas_subscription_id, plano, status, forma_pagamento")
    .eq("user_id", ctx.user.id)
    .neq("status", "cancelada")
    .maybeSingle();
  return data;
}
