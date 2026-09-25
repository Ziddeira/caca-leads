import { exigirAdminPagina } from "@/lib/admin/acesso";
import { createAdminClient } from "@/lib/supabase/admin";
import { LINK_IMAGEM_SEG, MENSAGENS_BUCKET, MSG_FALTA_ETAPA16, faltaEtapa16 } from "@/lib/mensagens/regras";
import { Secao } from "../comum";
import MensagensAdminClient, { type DenunciaChat } from "./MensagensAdminClient";

export const dynamic = "force-dynamic";

const SITUACOES = { pendente: "Pendentes", resolvida: "Resolvidas", descartada: "Descartadas" } as const;
type SituacaoFila = keyof typeof SITUACOES;

// Gestão > Mensagens: denúncias de conversa. A Gestão NÃO lê conversas:
// aqui aparece só a cópia das últimas mensagens que foi junto com cada
// denúncia (função SQL admin_chat_denuncias, que recusa quem não é
// administrador).
export default async function MensagensAdminPage({ searchParams }: { searchParams: Promise<{ situacao?: string }> }) {
  const supabase = await exigirAdminPagina();
  const pedido = (await searchParams).situacao;
  const situacao: SituacaoFila = pedido === "resolvida" || pedido === "descartada" ? pedido : "pendente";

  const { data, error } = await supabase.rpc("admin_chat_denuncias", { p_situacao: situacao });
  if (error) {
    if (!faltaEtapa16(error.code)) console.error("[admin/mensagens]", error.code, error.message);
    return (
      <p className="text-ink-2">
        {faltaEtapa16(error.code) ? MSG_FALTA_ETAPA16 : "Não foi possível carregar agora. Tente de novo em instantes."}
      </p>
    );
  }
  const denuncias = (data ?? []) as DenunciaChat[];

  // As imagens das mensagens denunciadas ficam num bucket privado que só
  // as duas pessoas da conversa leem. Para a denúncia, o servidor gera
  // links temporários com a chave service_role — só destas imagens.
  const paths = [...new Set(denuncias.flatMap((d) => d.mensagens.map((m) => m.imagem).filter((p): p is string => !!p)))];
  const urls: Record<string, string> = {};
  const admin = paths.length ? createAdminClient() : null;
  if (admin) {
    const { data: assinados, error: erroLinks } = await admin.storage
      .from(MENSAGENS_BUCKET)
      .createSignedUrls(paths, LINK_IMAGEM_SEG);
    if (erroLinks) console.error("[admin/mensagens] links das imagens:", erroLinks.message);
    for (const a of assinados ?? []) if (a.path && a.signedUrl) urls[a.path] = a.signedUrl;
  }

  return (
    <div>
      <Secao
        titulo="Denúncias de conversas"
        descricao="Você só vê as mensagens que foram enviadas junto com uma denúncia. Conversas sem denúncia continuam privadas."
      >
        <nav aria-label="Filtrar denúncias" className="mb-4 flex flex-wrap gap-2">
          {(Object.keys(SITUACOES) as SituacaoFila[]).map((s) => (
            <a
              key={s}
              href={s === "pendente" ? "?" : `?situacao=${s}`}
              aria-current={situacao === s ? "page" : undefined}
              className={`inline-flex min-h-11 items-center border px-4 text-sm font-semibold ${
                situacao === s ? "border-destaque bg-primary-soft text-destaque" : "border-line bg-surface text-ink-2 hover:text-ink"
              }`}
            >
              {SITUACOES[s]}
            </a>
          ))}
        </nav>
        {paths.length > 0 && !admin && (
          <p className="mb-4 text-sm text-ink-2">
            Para ver as imagens das denúncias, configure a variável SUPABASE_SERVICE_ROLE_KEY no servidor.
          </p>
        )}
        <MensagensAdminClient denuncias={denuncias} urls={urls} pendentes={situacao === "pendente"} />
      </Secao>
    </div>
  );
}
