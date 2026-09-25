import type { MetadataRoute } from "next";

// Manifesto do app (PWA): nome, cores e ícones da marca.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ártemis Prospect",
    short_name: "Ártemis",
    description: "Ache clientes que ainda não têm site.",
    start_url: "/painel/buscar",
    display: "standalone",
    background_color: "#0A0A0A",
    theme_color: "#0A0A0A",
    lang: "pt-BR",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
