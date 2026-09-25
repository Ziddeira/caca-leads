import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { PreviaLink } from "./tipos";

// Prévia simples do link de um post: título, descrição e nome do site,
// lidos das etiquetas da própria página (og:title, <title>...). Sem
// imagem de propósito: assim quem vê o feed não carrega nada de sites de
// fora.
//
// Proteções, porque é o NOSSO servidor que abre o link que o usuário
// digitou:
//   * só http/https, nas portas padrão;
//   * recusa endereços internos (localhost, rede privada, nuvem), também
//     depois de cada redirecionamento (no máximo 3);
//   * espera no máximo 4 segundos e lê no máximo 256 KB;
//   * só lê páginas HTML. Qualquer falha = post sem prévia.

const TEMPO_MAX_MS = 4000;
const BYTES_MAX = 256 * 1024;
const REDIRECIONAMENTOS_MAX = 3;

function ipInterno(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return ipInterno(v.slice(7));
  if (isIP(v) === 4) {
    const [a, b] = v.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

async function enderecoPermitido(url: URL): Promise<boolean> {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.port !== "") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false;
  if (isIP(host)) return !ipInterno(host);
  try {
    const enderecos = await lookup(host, { all: true, verbatim: true });
    return enderecos.length > 0 && enderecos.every((e) => !ipInterno(e.address));
  } catch {
    return false;
  }
}

async function lerHtml(resposta: Response): Promise<string | null> {
  const tipo = resposta.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml/i.test(tipo) || !resposta.body) return null;

  const leitor = resposta.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  while (total < BYTES_MAX) {
    const { done, value } = await leitor.read();
    if (done || !value) break;
    partes.push(value);
    total += value.byteLength;
  }
  await leitor.cancel().catch(() => {});

  const bytes = new Uint8Array(Math.min(total, BYTES_MAX));
  let pos = 0;
  for (const p of partes) {
    const pedaco = p.subarray(0, Math.max(0, bytes.length - pos));
    bytes.set(pedaco, pos);
    pos += pedaco.length;
  }

  const charset = /charset=([\w-]+)/i.exec(tipo)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function decodificar(texto: string) {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extrair(html: string, host: string): PreviaLink | null {
  const cabeca = html.slice(0, BYTES_MAX);
  const metas = new Map<string, string>();
  for (const m of cabeca.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const nome = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const conteudo = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (nome && conteudo && !metas.has(nome)) metas.set(nome, decodificar(conteudo));
  }
  const tituloTag = /<title[^>]*>([^<]*)<\/title>/i.exec(cabeca)?.[1];

  const titulo = metas.get("og:title") || metas.get("twitter:title") || (tituloTag ? decodificar(tituloTag) : "");
  const descricao = metas.get("og:description") || metas.get("twitter:description") || metas.get("description") || "";
  const site = metas.get("og:site_name") || host.replace(/^www\./, "");

  if (!titulo && !descricao) return null;
  return {
    titulo: titulo.slice(0, 200) || undefined,
    descricao: descricao.slice(0, 300) || undefined,
    site: site.slice(0, 100),
  };
}

export async function lerPreviaLink(link: string): Promise<PreviaLink | null> {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }

  const sinal = AbortSignal.timeout(TEMPO_MAX_MS);
  try {
    for (let i = 0; i <= REDIRECIONAMENTOS_MAX; i++) {
      if (!(await enderecoPermitido(url))) return null;
      const resposta = await fetch(url, {
        redirect: "manual",
        signal: sinal,
        cache: "no-store",
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; ArtemisProspectBot/1.0; link preview)",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (resposta.status >= 300 && resposta.status < 400) {
        const destino = resposta.headers.get("location");
        await resposta.body?.cancel().catch(() => {});
        if (!destino) return null;
        url = new URL(destino, url);
        continue;
      }
      if (!resposta.ok) {
        await resposta.body?.cancel().catch(() => {});
        return null;
      }
      const html = await lerHtml(resposta);
      return html ? extrair(html, url.hostname) : null;
    }
  } catch {
    return null;
  }
  return null;
}
