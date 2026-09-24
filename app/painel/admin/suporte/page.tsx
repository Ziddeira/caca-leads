import { exigirAdminPagina } from "@/lib/admin/acesso";
import { MSG_FALTA_ETAPA12, SITUACOES, SUPORTE_BUCKET, ehSituacao, faltaEtapa12 } from "@/lib/suporte/regras";
import SuporteClient, { type ChamadoAdmin } from "./SuporteClient";

export const dynamic = "force-dynamic";

interface Linha {
  id: number;
  user_id: string;
  email: string | null;
  apelido: string | null;
  assunto: ChamadoAdmin["assunto"];
  descricao: string;
  anexo_path: string | null;
  situacao: ChamadoAdmin["situacao"];
  diagnostico: Record<string, unknown>;
  resposta: string | null;
  respondido_em: string | null;
  resolvido_em: string | null;
  criado_em: string;
}

// Gestão > Suporte: todos os chamados, com os dados da conta, a imagem
// anexada e o campo de resposta. A função SQL admin_listar_chamados
// recusa quem não é administrador.
export default async function SuporteAdminPage({ searchParams }: { searchParams: Promise<{ situacao?: string }> }) {
  const supabase = await exigirAdminPagina();
  const { situacao } = await searchParams;
  const filtro = ehSituacao(situacao) ? situacao : null;

  const { data, error } = await supabase.rpc("admin_listar_chamados", { p_situacao: filtro });
  if (error) {
    if (!faltaEtapa12(error.code)) console.error("[admin/suporte]", error.code, error.message);
    return (
      <p className="text-ink-2">
        {faltaEtapa12(error.code) ? MSG_FALTA_ETAPA12 : "Não foi possível carregar agora. Tente de novo em instantes."}
      </p>
    );
  }

  // Link temporário (1 hora) para cada imagem: o bucket é privado e as
  // regras dele só deixam o dono e o administrador ler.
  const chamados: ChamadoAdmin[] = await Promise.all(
    ((data ?? []) as Linha[]).map(async (c) => {
      let anexo: string | null = null;
      if (c.anexo_path) {
        const { data: assinado } = await supabase.storage.from(SUPORTE_BUCKET).createSignedUrl(c.anexo_path, 3600);
        anexo = assinado?.signedUrl ?? null;
      }
      return {
        id: c.id,
        email: c.email,
        apelido: c.apelido,
        assunto: c.assunto,
        descricao: c.descricao,
        anexo,
        temAnexo: !!c.anexo_path,
        situacao: c.situacao,
        diagnostico: c.diagnostico ?? {},
        resposta: c.resposta,
        respondidoEm: c.respondido_em,
        criadoEm: c.criado_em,
      };
    }),
  );

  const filtros = [{ id: null, nome: "Todos" }, ...Object.entries(SITUACOES).map(([id, nome]) => ({ id, nome }))];

  return (
    <div>
      <nav aria-label="Filtrar por situação" className="mb-4 flex flex-wrap gap-2">
        {filtros.map((f) => (
          <a
            key={f.id ?? "todos"}
            href={f.id ? `?situacao=${f.id}` : "?"}
            aria-current={filtro === f.id ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${
              filtro === f.id ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-ink-2 hover:text-ink"
            }`}
          >
            {f.nome}
          </a>
        ))}
      </nav>
      <SuporteClient chamados={chamados} />
    </div>
  );
}
