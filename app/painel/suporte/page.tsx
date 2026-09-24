import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TituloPagina } from "@/components/ui";
import { LIMITE_CHAMADOS_ABERTOS, MSG_FALTA_ETAPA12, SUPORTE_BUCKET, faltaEtapa12 } from "@/lib/suporte/regras";
import MeusChamadosClient, { type MeuChamado } from "./MeusChamadosClient";

export const dynamic = "force-dynamic";

interface Linha {
  id: number;
  assunto: MeuChamado["assunto"];
  descricao: string;
  anexo_path: string | null;
  situacao: MeuChamado["situacao"];
  resposta: string | null;
  respondido_em: string | null;
  criado_em: string;
}

// Meus chamados: o usuário vê só os próprios (regra de RLS da tabela
// "chamados") e as respostas. Para abrir um novo, o botão "Preciso de
// ajuda" no canto da tela.
export default async function SuportePage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("chamados")
    .select("id, assunto, descricao, anexo_path, situacao, resposta, respondido_em, criado_em")
    .eq("user_id", user.id)
    .order("criado_em", { ascending: false })
    .limit(100);
  if (error && !faltaEtapa12(error.code)) console.error("[suporte]", error.code, error.message);

  // Link temporário (1 hora) para abrir a imagem: o bucket é privado.
  const chamados: MeuChamado[] = await Promise.all(
    ((data ?? []) as Linha[]).map(async (c) => {
      let anexo: string | null = null;
      if (c.anexo_path) {
        const { data: assinado } = await supabase.storage.from(SUPORTE_BUCKET).createSignedUrl(c.anexo_path, 3600);
        anexo = assinado?.signedUrl ?? null;
      }
      return {
        id: c.id,
        assunto: c.assunto,
        descricao: c.descricao,
        anexo,
        situacao: c.situacao,
        resposta: c.resposta,
        respondidoEm: c.respondido_em,
        criadoEm: c.criado_em,
      };
    }),
  );

  return (
    <div>
      <TituloPagina
        titulo="Meus chamados"
        descricao={`Seus pedidos de ajuda e as respostas. Para abrir um novo, use o botão "Preciso de ajuda" no canto da tela. Até ${LIMITE_CHAMADOS_ABERTOS} chamados abertos ao mesmo tempo.`}
      />
      {error ? (
        <p className="mt-6 text-ink-2">
          {faltaEtapa12(error.code) ? MSG_FALTA_ETAPA12 : "Não foi possível carregar seus chamados agora."}
        </p>
      ) : (
        <MeusChamadosClient chamados={chamados} />
      )}
    </div>
  );
}
