import "server-only";
// Verificação automática de uma venda (roda só no servidor, na rotina
// semanal). Três conferências, nesta ordem — a mais barata primeiro, e o
// Google (que custa) só quando as duas primeiras passam:
//   (b) o endereço é de domínio próprio (mesma classificação da busca);
//   (a) o site abre e está no ar;
//   (b) de novo, no endereço final depois dos redirecionamentos;
//   (c) o Google Maps da empresa (place_id) aponta para esse site.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { classificar, hostDe, nomePlataforma } from "@/lib/leads/classificacao";
import { ErroGooglePlaces, siteNoGoogle } from "@/lib/leads/google";

export type ResultadoVerificacao = "verificada" | "aguardando_google" | "nao_verificada" | "erro_temporario";

export interface Verificacao {
  resultado: ResultadoVerificacao;
  siteNoAr: boolean | null;
  dominioProprio: boolean | null;
  googleConfere: boolean | null;
  motivo: string | null;
  chamouGoogle: boolean;
}

const TEMPO_LIMITE_MS = 10_000;
const MAX_REDIRECIONAMENTOS = 5;
const AGENTE =
  "Mozilla/5.0 (compatible; CacaLeadsVerificador/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ---------------------------------------------------------------------------
// (b) Domínio próprio

function motivoDominio(url: string): string | null {
  const host = hostDe(url);
  if (!host || !host.includes(".")) return "O endereço informado não é um site válido.";
  if (isIP(host.replace(/^\[|\]$/g, ""))) {
    return "O endereço é um número de IP, não um domínio. Informe o domínio do site (ex.: www.seucliente.com.br).";
  }
  const tipo = classificar(url);
  if (tipo === "booking") {
    return `Esse endereço é de uma plataforma de reservas (${nomePlataforma(url)}), não um site próprio. A venda precisa ser de um site com domínio do cliente (ex.: www.seucliente.com.br).`;
  }
  if (tipo === "rede_social") {
    return `Esse endereço é de ${nomePlataforma(url)} (rede social, app ou página gratuita), não um site próprio. A venda precisa ser de um site com domínio do cliente (ex.: www.seucliente.com.br).`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// (a) Site no ar
//
// Proteção: o endereço vem do usuário, então nunca deixamos o servidor
// abrir endereços internos (localhost, rede privada, metadados da nuvem).
// Os redirecionamentos são seguidos um a um para conferir cada destino.

function ipInterno(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return ipInterno(v6.slice(7));
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

class SiteFora extends Error {}

async function conferirDestino(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SiteFora("O endereço precisa começar com http:// ou https://.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new SiteFora("O endereço usa uma porta fora do padrão; informe o endereço normal do site.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let ips: string[];
  if (isIP(host)) {
    ips = [host];
  } else {
    try {
      ips = (await lookup(host, { all: true })).map((r) => r.address);
    } catch {
      throw new SiteFora(
        `O domínio ${host} não foi encontrado na internet. Confira se o endereço está escrito certo e se o domínio já está registrado e apontando para a hospedagem.`,
      );
    }
  }
  if (!ips.length || ips.some(ipInterno)) {
    throw new SiteFora("O endereço aponta para uma rede interna e não pode ser verificado.");
  }
}

function motivoErroRede(e: unknown, host: string): string {
  const err = e as { name?: string; cause?: { code?: string } };
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    return `O site ${host} demorou mais de ${TEMPO_LIMITE_MS / 1000} segundos para responder.`;
  }
  const codigo = err?.cause?.code ?? "";
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(codigo)) {
    return `O site ${host} tem um problema no certificado de segurança (cadeado do https). Peça para a hospedagem ativar ou renovar o SSL.`;
  }
  if (codigo === "ECONNREFUSED" || codigo === "ECONNRESET") {
    return `O servidor do site ${host} recusou a conexão. Confira se a hospedagem está ativa.`;
  }
  return `Não conseguimos abrir o site ${host}. Confira se ele está no ar.`;
}

// Devolve o endereço final (depois dos redirecionamentos) ou lança
// SiteFora com o motivo em português simples.
async function abrirSite(endereco: string): Promise<string> {
  let atual = new URL(endereco);
  for (let i = 0; i <= MAX_REDIRECIONAMENTOS; i++) {
    await conferirDestino(atual);
    let res: Response;
    try {
      res = await fetch(atual, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        headers: { "User-Agent": AGENTE, Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      });
    } catch (e) {
      throw new SiteFora(motivoErroRede(e, atual.hostname));
    }
    // Não precisamos do conteúdo: libera a conexão.
    res.body?.cancel().catch(() => {});

    const local = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && local) {
      atual = new URL(local, atual);
      continue;
    }
    // 2xx: no ar. 401/403/429: o servidor respondeu, só está bloqueando
    // robôs (ex.: proteção da Cloudflare) — o site existe e está no ar.
    if (res.ok || [401, 403, 429].includes(res.status)) return atual.toString();
    if (res.status === 404 || res.status === 410) {
      throw new SiteFora(`O site ${atual.hostname} respondeu "página não encontrada" (erro ${res.status}). Confira se o endereço está certo e se o site foi publicado.`);
    }
    throw new SiteFora(`O site ${atual.hostname} respondeu com erro ${res.status}. Ele parece estar fora do ar.`);
  }
  throw new SiteFora("O site redireciona muitas vezes seguidas e não chega a abrir.");
}

// ---------------------------------------------------------------------------
// (c) Google Maps

// Mesmo site: mesmo domínio (sem "www."), ou um é subdomínio do outro
// (ex.: loja.cliente.com.br e cliente.com.br).
function mesmoSite(a: string | null, b: string | null) {
  if (!a || !b) return false;
  return a === b || a.endsWith("." + b) || b.endsWith("." + a);
}

// ---------------------------------------------------------------------------

export async function verificarVenda(venda: {
  placeId: string;
  siteUrl: string;
  nomeEmpresa: string | null;
}): Promise<Verificacao> {
  const empresa = venda.nomeEmpresa ? `de ${venda.nomeEmpresa}` : "da empresa";
  const r: Verificacao = {
    resultado: "nao_verificada",
    siteNoAr: null,
    dominioProprio: null,
    googleConfere: null,
    motivo: null,
    chamouGoogle: false,
  };

  // (b) no endereço informado — não precisa abrir nada.
  const motivoInformado = motivoDominio(venda.siteUrl);
  if (motivoInformado) {
    return { ...r, dominioProprio: false, motivo: motivoInformado };
  }

  // (a) site no ar.
  let final: string;
  try {
    final = await abrirSite(venda.siteUrl);
    r.siteNoAr = true;
  } catch (e) {
    if (e instanceof SiteFora) return { ...r, siteNoAr: false, motivo: e.message };
    return { ...r, resultado: "erro_temporario", motivo: "Falha inesperada ao abrir o site." };
  }

  // (b) no endereço final: um domínio próprio que só redireciona para o
  // Instagram, por exemplo, não conta.
  const motivoFinal = motivoDominio(final);
  if (motivoFinal) {
    return {
      ...r,
      dominioProprio: false,
      motivo: `O endereço abre, mas redireciona para ${hostDe(final)}. ${motivoFinal}`,
    };
  }
  r.dominioProprio = true;

  // (c) Google Maps da empresa.
  let noGoogle: string | null;
  try {
    r.chamouGoogle = true;
    noGoogle = await siteNoGoogle(venda.placeId);
  } catch (e) {
    const msg = e instanceof ErroGooglePlaces ? e.message : "erro de rede";
    console.error("[verificacao] Google falhou:", venda.placeId, msg);
    return { ...r, resultado: "erro_temporario", motivo: `Google indisponível: ${msg}` };
  }

  const hostGoogle = noGoogle ? hostDe(noGoogle) : null;
  if (mesmoSite(hostGoogle, hostDe(venda.siteUrl)) || mesmoSite(hostGoogle, hostDe(final))) {
    return { ...r, resultado: "verificada", googleConfere: true };
  }

  const dica =
    "Peça ao cliente para colocar o endereço do site no Perfil da Empresa no Google (business.google.com > Editar perfil > Site). A mudança pode levar alguns dias para aparecer; tentaremos de novo na próxima semana.";
  return {
    ...r,
    resultado: "aguardando_google",
    googleConfere: false,
    motivo: hostGoogle
      ? `O site está no ar, mas o Google Maps ${empresa} ainda mostra outro endereço (${hostGoogle}). ${dica}`
      : `O site está no ar, mas o Google Maps ${empresa} ainda não mostra nenhum site. ${dica}`,
  };
}
