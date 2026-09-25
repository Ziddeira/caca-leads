import type { MetadataRoute } from "next";
import { PAGINAS_PUBLICAS, URL_SITE } from "@/lib/site";

// sitemap.xml com as páginas públicas (lista em lib/site.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGINAS_PUBLICAS.map((p) => ({
    url: p.caminho === "/" ? URL_SITE : `${URL_SITE}${p.caminho}`,
    changeFrequency: p.frequencia,
    priority: p.prioridade,
  }));
}
