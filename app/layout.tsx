import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Manrope } from "next/font/google";
import "./globals.css";
import { ScriptTema, TemaDoAparelho } from "@/components/tema/Tema";
import { DESCRICAO_SITE, NOME_SITE, TITULO_INICIO, URL_SITE } from "@/lib/site";

// Fontes da marca (brand/MANUAL.md, seção 4): Chakra Petch nos títulos,
// botões, rótulos e números; Manrope no texto e na interface.
const chakra = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// Metadados padrão de todas as páginas (lib/site.ts). Cada página
// pública completa com o próprio título e a URL canônica; o painel sai
// da indexação no app/painel/layout.tsx.
export const metadata: Metadata = {
  metadataBase: new URL(URL_SITE),
  title: {
    default: TITULO_INICIO,
    template: `%s · ${NOME_SITE}`,
  },
  description: DESCRICAO_SITE,
  applicationName: NOME_SITE,
  appleWebApp: { title: NOME_SITE, statusBarStyle: "black" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: NOME_SITE,
    title: TITULO_INICIO,
    description: DESCRICAO_SITE,
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO_INICIO,
    description: DESCRICAO_SITE,
  },
};

// "viewportFit: cover" libera o uso de env(safe-area-inset-*) no iPhone.
// A cor da barra do navegador começa com o fundo do tema escuro
// (padrão) e é trocada pelo components/tema/Tema.tsx quando o tema muda.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#141414",
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-tema começa no escuro (padrão); o script do <head> troca pela
    // escolha guardada antes da primeira pintura, então a página não
    // pisca branco nem pisca o tema errado.
    <html
      lang="pt-BR"
      data-tema="escuro"
      data-tema-escolha="escuro"
      suppressHydrationWarning
      className={`${chakra.variable} ${manrope.variable} h-full`}
    >
      <head>
        <ScriptTema />
      </head>
      <body className="min-h-full font-sans antialiased">
        <TemaDoAparelho />
        {children}
      </body>
    </html>
  );
}
