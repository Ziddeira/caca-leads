import { createClient } from "@/lib/supabase/server";
import { cacheValido, type DadosLead } from "@/lib/leads/dadosLead";
import { deLinha, type LinhaUltimaBusca, type UltimaBusca } from "@/lib/leads/ultimaBusca";
import BuscaClient from "./BuscaClient";

export const dynamic = "force-dynamic";

export default async function BuscarPage() {
  const supabase = await createClient();
  if (!supabase) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink">Buscar</h1>
        <p className="mt-2 text-ink-2">Supabase não configurado neste ambiente.</p>
      </div>
    );
  }

  // "meu_plano" aplica o vencimento do plano (volta ao Grátis se o ciclo
  // pago acabou sem renovação) antes de devolver plano e saldo.
  const { data: perfil } = await supabase
    .rpc("meu_plano")
    .single<{ plano: string; buscas_restantes: number; creditos_desbloqueio: number }>();

  const ultimaBusca = await lerUltimaBusca(supabase);

  return (
    <BuscaClient
      ultimaBusca={ultimaBusca}
      perfilInicial={{
        plano: perfil?.plano ?? "gratis",
        buscasRestantes: perfil?.buscas_restantes ?? 0,
        creditosDesbloqueio: perfil?.creditos_desbloqueio ?? 0,
      }}
    />
  );
}

type ClienteSupabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;

// Recarrega a última busca salva. Só LÊ o banco: não gasta busca e não
// chama o Google (o Google só é chamado em POST /api/leads/buscar, quando
// o usuário clica em "Buscar leads"). Se a busca passou do prazo, a
// função do banco apaga a lista e ela volta nula ("esta busca expirou").
async function lerUltimaBusca(supabase: ClienteSupabase): Promise<UltimaBusca | null> {
  const { data, error } = await supabase
    .rpc("minha_ultima_busca")
    .maybeSingle<LinhaUltimaBusca>();
  // Sem o SQL da etapa 15, a página funciona como antes (sem busca salva).
  if (error || !data) return null;

  const busca = deLinha(data);
  if (!busca.leads?.length) return busca;

  // O contato não é salvo com a busca: vem do desbloqueio. Para quem já
  // desbloqueou, usa o cache de "Meus leads" (etapa 4), que também é só
  // leitura do banco.
  type Desbloqueado = { place_id: string; dados?: DadosLead | null; dados_atualizados_em?: string | null };
  const ids = busca.leads.map((l) => l.id);
  const comCache = await supabase
    .from("leads_desbloqueados")
    .select("place_id, dados, dados_atualizados_em")
    .in("place_id", ids)
    .returns<Desbloqueado[]>();
  let desbloqueados = comCache.data;
  if (comCache.error) {
    // Sem o cache da etapa 4: só marca quem já foi desbloqueado.
    ({ data: desbloqueados } = await supabase
      .from("leads_desbloqueados")
      .select("place_id")
      .in("place_id", ids)
      .returns<Desbloqueado[]>());
  }

  const porId = new Map((desbloqueados || []).map((d) => [d.place_id, d]));
  busca.leads = busca.leads.map((lead) => {
    const linha = porId.get(lead.id);
    if (!linha) return lead;
    const dados = linha.dados && cacheValido(linha.dados_atualizados_em) ? linha.dados : null;
    if (!dados) return { ...lead, desbloqueado: true };
    return {
      ...lead,
      contato: { telefone: dados.telefone, whatsapp: dados.whatsapp, site: dados.site, maps: dados.maps },
    };
  });
  return busca;
}
