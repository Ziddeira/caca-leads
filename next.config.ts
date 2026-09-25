import type { NextConfig } from "next";

// Endereço antigo da Vercel. Quem chega por ele vai para o domínio
// oficial, no mesmo caminho, para o Google não ver dois sites iguais.
// As rotas /api/ ficam de fora: webhooks (Asaas) e crons que ainda
// chamem o endereço antigo continuam funcionando, sem redirecionamento.
const HOST_ANTIGO = "caca-leads.vercel.app";
const DOMINIO = "https://artemisprospect.com.br";

const nextConfig: NextConfig = {
  async redirects() {
    const noHostAntigo = [{ type: "host" as const, value: HOST_ANTIGO }];
    return [
      { source: "/", has: noHostAntigo, destination: `${DOMINIO}/`, permanent: true },
      {
        source: "/:caminho((?!api/).*)",
        has: noHostAntigo,
        destination: `${DOMINIO}/:caminho`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
