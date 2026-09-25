import type { Metadata } from "next";

// Dados públicos do site, usados nos metadados (título, Open Graph,
// URL canônica), no robots.txt, no sitemap.xml e no JSON-LD.

// Endereço oficial. Os links canônicos e o sitemap apontam sempre para
// ele, mesmo em deploys de preview, para o Google não ver dois endereços
// com o mesmo conteúdo. NEXT_PUBLIC_SITE_URL troca o endereço, se um dia
// o domínio mudar.
export const URL_SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://artemisprospect.com.br").replace(/\/$/, "");

export const NOME_SITE = "Ártemis Prospect";

export const TITULO_INICIO = "Ártemis Prospect — encontre empresas sem site para prospectar";

export const DESCRICAO_SITE =
  "Ache clientes que ainda não têm site. Busque por nicho e bairro e veja quem não tem site, quem depende do Airbnb e quem só usa Instagram, com o WhatsApp pronto para chamar.";

// Páginas públicas que entram no sitemap. O painel exige login e fica
// fora (e bloqueado no robots.txt).
export const PAGINAS_PUBLICAS = [
  { caminho: "/", prioridade: 1, frequencia: "weekly" },
  { caminho: "/cadastro", prioridade: 0.8, frequencia: "monthly" },
  { caminho: "/login", prioridade: 0.5, frequencia: "monthly" },
] as const;

// Metadados de uma página pública: título, descrição, URL canônica,
// Open Graph e Twitter Card. O Next troca o objeto openGraph inteiro
// (não mescla com o do layout), então tudo é repetido aqui. A imagem de
// compartilhamento vem de app/opengraph-image.png e app/twitter-image.png.
export function metadadosPagina({
  titulo,
  descricao = DESCRICAO_SITE,
  caminho,
  absoluto = false,
}: {
  titulo: string;
  descricao?: string;
  caminho: string;
  absoluto?: boolean;
}): Metadata {
  const tituloCompleto = absoluto ? titulo : `${titulo} · ${NOME_SITE}`;
  return {
    title: absoluto ? { absolute: titulo } : titulo,
    description: descricao,
    alternates: { canonical: caminho },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: NOME_SITE,
      url: caminho,
      title: tituloCompleto,
      description: descricao,
    },
    twitter: {
      card: "summary_large_image",
      title: tituloCompleto,
      description: descricao,
    },
  };
}

// Páginas que não devem aparecer no Google (painel, telas de conta).
export const SEM_INDEXACAO: Metadata["robots"] = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
};
