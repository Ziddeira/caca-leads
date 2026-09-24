import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COMPROVANTE_BUCKET, MSG_FALTA_ETAPA8, faltaEtapa8 } from "@/lib/vendas/regras";
import { TituloPagina } from "@/components/ui";
import AdminClient, { type VendaAnalise } from "./AdminClient";

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

// Tela do administrador: comprovantes esperando análise. Só aparece para
// quem está na tabela "administradores" (função eh_admin do banco); para
// qualquer outra pessoa a página simplesmente não existe (404).
export default async function AdminPage() {
  const supabase = await createClient();
  if (!supabase) notFound();

  const { data: ehAdmin, error: erroAdmin } = await supabase.rpc("eh_admin");
  if (erroAdmin && faltaEtapa8(erroAdmin.code)) {
    return (
      <div>
        <TituloPagina titulo="Administração" />
        <p className="mt-4 text-ink-2">{MSG_FALTA_ETAPA8}</p>
      </div>
    );
  }
  if (ehAdmin !== true) notFound();

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
      <TituloPagina
        titulo="Administração"
        descricao="Comprovantes de venda esperando sua análise. Aprovar vale +40 pontos; recusar tira os 10 pontos do fechamento."
      />
      {error ? (
        <p className="mt-6 text-ink-2">Não foi possível carregar a lista agora.</p>
      ) : (
        <AdminClient vendas={vendas} />
      )}
    </div>
  );
}
