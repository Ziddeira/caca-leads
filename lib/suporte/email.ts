import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ASSUNTOS, type Assunto } from "./regras";

// Cópia do chamado por e-mail — PREPARADO, MAS DESLIGADO.
//
// Hoje nenhum serviço de e-mail está ligado: "provedor" é null e
// enviarCopiaChamado não faz nada (o chamado continua salvo no banco e
// aparece em Gestão > Suporte normalmente).
//
// Para ligar no futuro:
//   1. escolha um serviço (Resend, Postmark, SendGrid...) e escreva a
//      função "provedor" abaixo, que recebe { para, assunto, texto } e
//      envia;
//   2. cadastre na Vercel a variável SUPORTE_EMAIL_DESTINO (o e-mail que
//      recebe as cópias) e a chave do serviço;
//   3. pronto: cada chamado novo manda a cópia e marca
//      chamados.email_copia_enviada_em.

export interface MensagemEmail {
  para: string;
  assunto: string;
  texto: string;
}

type Provedor = (mensagem: MensagemEmail) => Promise<void>;

const provedor: Provedor | null = null;

export interface DadosCopia {
  id: number;
  assunto: Assunto;
  descricao: string;
  temAnexo: boolean;
  diagnostico: Record<string, unknown>;
}

export function montarEmailChamado(dados: DadosCopia, para: string): MensagemEmail {
  const linhas = Object.entries(dados.diagnostico)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${String(v)}`);
  return {
    para,
    assunto: `[Caça-leads] Chamado #${dados.id} — ${ASSUNTOS[dados.assunto]}`,
    texto: [
      dados.descricao,
      "",
      dados.temAnexo ? "Tem imagem anexada (veja em Gestão > Suporte)." : "Sem anexo.",
      "",
      "Dados da conta:",
      ...linhas,
    ].join("\n"),
  };
}

// Nunca derruba quem chamou: se o envio falhar, só vai para o log.
export async function enviarCopiaChamado(dados: DadosCopia): Promise<boolean> {
  const destino = process.env.SUPORTE_EMAIL_DESTINO;
  if (!provedor || !destino) return false;
  try {
    await provedor(montarEmailChamado(dados, destino));
    const admin = createAdminClient();
    await admin?.rpc("marcar_email_chamado_enviado", { p_id: dados.id });
    return true;
  } catch (e) {
    console.error("[suporte/email]", e);
    return false;
  }
}
