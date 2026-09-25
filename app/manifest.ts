import type { MetadataRoute } from "next";
import { DESCRICAO_SITE, NOME_SITE } from "@/lib/site";

// Manifesto do app (PWA): nome, cores e ícones da marca. O Next serve
// este arquivo em /manifest.webmanifest e já põe o link no <head>.
// Cores: preto #0A0A0A e amarelo Ártemis #FFD60A (brand/MANUAL.md).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: NOME_SITE,
    short_name: "Ártemis",
    description: DESCRICAO_SITE,
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/painel/buscar",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A0A0A",
    theme_color: "#0A0A0A",
    categories: ["business", "productivity"],
    icons: [
      { src: "/brand/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
