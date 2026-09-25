import { exigirAdminPagina } from "@/lib/admin/acesso";
import { MSG_FALTA_ETAPA14, faltaEtapa14 } from "@/lib/comunidade/regras";
import { Secao } from "../comum";
import ComunidadeAdminClient, { type GrupoDenuncia, type Suspensao } from "./ComunidadeAdminClient";

export const dynamic = "force-dynamic";

const SITUACOES = { pendente: "Pendentes", resolvida: "Resolvidas", descartada: "Descartadas" } as const;
type SituacaoFila = keyof typeof SITUACOES;

// Gestão > Comunidade: fila de denúncias (agrupadas por conteúdo),
// remoção de conteúdo e suspensão do autor. As funções SQL
// admin_comunidade_* recusam quem não é administrador e registram quem
// moderou e quando.
export default async function ComunidadeAdminPage({ searchParams }: { searchParams: Promise<{ situacao?: string }> }) {
  const supabase = await exigirAdminPagina();
  const pedido = (await searchParams).situacao;
  const situacao: SituacaoFila = pedido === "resolvida" || pedido === "descartada" ? pedido : "pendente";

  const [fila, suspensoes] = await Promise.all([
    supabase.rpc("admin_comunidade_fila", { p_situacao: situacao }),
    supabase.rpc("admin_comunidade_suspensoes"),
  ]);
  const erro = fila.error ?? suspensoes.error;
  if (erro) {
    if (!faltaEtapa14(erro.code)) console.error("[admin/comunidade]", erro.code, erro.message);
    return (
      <p className="text-ink-2">
        {faltaEtapa14(erro.code) ? MSG_FALTA_ETAPA14 : "Não foi possível carregar agora. Tente de novo em instantes."}
      </p>
    );
  }

  return (
    <div>
      <Secao titulo="Denúncias" descricao="Um cartão por conteúdo denunciado, com mais denúncias primeiro.">
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
        <ComunidadeAdminClient
          grupos={(fila.data ?? []) as GrupoDenuncia[]}
          suspensoes={(suspensoes.data ?? []) as Suspensao[]}
          pendentes={situacao === "pendente"}
        />
      </Secao>
    </div>
  );
}
