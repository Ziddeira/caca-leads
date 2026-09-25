import type { MetadataRoute } from "next";
import { URL_SITE } from "@/lib/site";

// robots.txt: libera as páginas públicas e bloqueia o que exige login
// ou não é página (painel, API, telas de conta).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/painel", "/api/", "/auth/", "/boas-vindas", "/redefinir-senha", "/esqueci-senha"],
    },
    sitemap: `${URL_SITE}/sitemap.xml`,
    host: URL_SITE,
  };
}
