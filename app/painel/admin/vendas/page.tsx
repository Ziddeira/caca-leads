import { exigirAdminPagina } from "@/lib/admin/acesso";
import { COMPROVANTE_BUCKET, MSG_FALTA_ETAPA8, faltaEtapa8 } from "@/lib/vendas/regras";
import VendasClient, { type VendaAnalise } from "./VendasClient";

export const dynamic = "force-dynamic";

interface Linha {
  venda_id: number;
  apelido: string | null;
  email: string | null;
  place_id: string;
  nome_empresa: string | null;
  site_url: string;
  fechado_em: string;
  tentativas: number;
  ultimo_motivo: string | null;
  comprovante_path: string | null;
  comprovante_enviado_em: string | null;
}

// Administração > Vendas a aprovar: comprovantes esperando análise.
// Quem não é administrador nem chega aqui (proxy e layout barram), e a
// função SQL vendas_em_analise recusa de novo.
export default async function VendasPage() {
  const supabase = await exigirAdminPagina();

  const { data: bruto, error } = await supabase.rpc("vendas_em_analise");
  const data = bruto as Linha[] | null;
  if (error) console.error("[admin]", error.code, error.message);

  // Link temporário (1 hora) para abrir cada comprovante: o bucket é
  // privado e as regras dele só deixam o dono e o administrador ler.
  const vendas: VendaAnalise[] = await Promise.all(
    (data ?? []).map(async (l) => {
      let link: string | null = null;
      if (l.comprovante_path) {
        const { data: assinado } = await supabase.storage
          .from(COMPROVANTE_BUCKET)
          .createSignedUrl(l.comprovante_path, 3600);
        link = assinado?.signedUrl ?? null;
      }
      return {
        id: l.venda_id,
        apelido: l.apelido,
        email: l.email,
        empresa: l.nome_empresa,
        maps: `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(l.place_id)}`,
        siteUrl: l.site_url,
        fechadoEm: l.fechado_em,
        tentativas: l.tentativas,
        ultimoMotivo: l.ultimo_motivo,
        comprovante: link,
        ehPdf: l.comprovante_path?.endsWith(".pdf") ?? false,
        enviadoEm: l.comprovante_enviado_em,
      };
    }),
  );

  return (
    <div>
      <p className="text-base text-ink-2">
        Comprovantes de venda esperando sua análise. Aprovar vale +40 pontos; recusar tira os 10 pontos do fechamento.
      </p>
      {error ? (
        <p className="mt-6 text-ink-2">{faltaEtapa8(error.code) ? MSG_FALTA_ETAPA8 : "Não foi possível carregar a lista agora."}</p>
      ) : (
        <VendasClient vendas={vendas} />
      )}
    </div>
  );
}
