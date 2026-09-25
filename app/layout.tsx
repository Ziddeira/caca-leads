import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Manrope } from "next/font/google";
import "./globals.css";
import { ScriptTema, TemaDoAparelho } from "@/components/tema/Tema";

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

const TITULO = "Ártemis Prospect";
const DESCRICAO =
  "Ache clientes que ainda não têm site. Busque por nicho e bairro e veja quem não tem site, quem depende do Airbnb e quem só usa Instagram, com o WhatsApp pronto para chamar.";

// Endereço público usado para montar os links absolutos do Open Graph.
// Na Vercel, cada deploy tem o próprio endereço (preview ou produção).
const URL_BASE = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(URL_BASE),
  title: {
    default: TITULO,
    template: `%s · ${TITULO}`,
  },
  description: DESCRICAO,
  applicationName: TITULO,
  appleWebApp: { title: TITULO, statusBarStyle: "black" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: TITULO,
    title: `${TITULO} · Ache clientes que ainda não têm site`,
    description: DESCRICAO,
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITULO} · Ache clientes que ainda não têm site`,
    description: DESCRICAO,
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
