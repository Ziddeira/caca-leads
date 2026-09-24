import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cacheValido, type DadosLead } from "@/lib/leads/dadosLead";
import { situacaoFunilValida, type StatusVenda, type VendaResumo } from "@/lib/leads/funil";
import { EstadoVazio, TituloPagina, BOTAO } from "@/components/ui";
import { IconeLeads, IconeSeta } from "@/components/Icones";
import MeusLeadsClient, { type LeadSalvo } from "./MeusLeadsClient";

export const dynamic = "force-dynamic";

interface Linha {
  place_id: string;
  desbloqueado_em: string;
  dados?: DadosLead | null;
  dados_atualizados_em?: string | null;
  situacao?: string | null;
  anotacao?: string | null;
  ultimo_contato_em?: string | null;
}

interface LinhaVenda {
  place_id: string;
  site_url: string;
  fechado_em: string;
  status: StatusVenda;
}

const COLUNAS_ETAPA4 = "place_id, desbloqueado_em, dados, dados_atualizados_em";
const COLUNAS_ETAPA7 = `${COLUNAS_ETAPA4}, situacao, anotacao, ultimo_contato_em`;

// A página lê SÓ do banco: os dados de contato vêm do cache gravado no
// desbloqueio (leads_desbloqueados.dados). O Google só é consultado,
// depois que a página já apareceu, para os leads sem cache ou com cache
// vencido (mais de 30 dias) — uma vez, não a cada visita.
export default async function MeusLeadsPage() {
  const supabase = await createClient();
  if (!supabase) {
    return <Aviso texto="Supabase não configurado neste ambiente." />;
  }

  // O RLS já limita às linhas do usuário logado (o layout do painel já
  // conferiu o login), então não precisa de outra ida ao Auth aqui.
  let resposta = await supabase
    .from("leads_desbloqueados")
    .select(COLUNAS_ETAPA7)
    .order("desbloqueado_em", { ascending: false })
    .returns<Linha[]>();
  // Sem o script da etapa 7, não há situação/anotação: a lista abre como
  // antes e o funil fica desligado, com um aviso.
  const funilAtivo = !resposta.error;

  if (resposta.error) {
    resposta = await supabase
      .from("leads_desbloqueados")
      .select(COLUNAS_ETAPA4)
      .order("desbloqueado_em", { ascending: false })
      .returns<Linha[]>();
  }

  // Se o script da etapa 4 ainda não foi rodado, as colunas de cache não
  // existem: cai para a consulta antiga e os dados vêm do Google depois.
  if (resposta.error) {
    resposta = await supabase
      .from("leads_desbloqueados")
      .select("place_id, desbloqueado_em")
      .order("desbloqueado_em", { ascending: false })
      .returns<Linha[]>();
  }

  if (resposta.error) {
    return <Aviso texto="Não foi possível carregar seus leads desbloqueados agora. Tente recarregar a página." />;
  }

  // Vendas do usuário (o RLS só devolve as dele). O valor recebido não é
  // lido aqui: nunca aparece na tela.
  let vendas: LinhaVenda[] = [];
  if (funilAtivo) {
    const r = await supabase
      .from("vendas")
      .select("place_id, site_url, fechado_em, status")
      .returns<LinhaVenda[]>();
    vendas = r.data ?? [];
  }

  const leads = montarLeads(resposta.data ?? [], vendas);

  return (
    <div>
      <TituloPagina
        titulo="Meus leads"
        descricao={
          leads.length
            ? `${leads.length} ${leads.length === 1 ? "lead" : "leads"}, com contato pronto para chamar. Marque em que pé está cada conversa.`
            : "Os leads que você desbloquear ficam guardados aqui."
        }
      />

      {leads.length ? (
        <MeusLeadsClient leads={leads} funilAtivo={funilAtivo} />
      ) : (
        <div className="mt-8">
          <EstadoVazio
            icone={<IconeLeads width={26} height={26} />}
            titulo="Nenhum lead desbloqueado ainda"
            texto="Busque por nicho e bairro e desbloqueie quem vale a conversa. O WhatsApp e o link do Maps ficam salvos aqui."
          >
            <Link href="/painel/buscar" className={BOTAO}>
              Buscar leads <IconeSeta width={18} height={18} />
            </Link>
          </EstadoVazio>
        </div>
      )}
    </div>
  );
}

// Cache vencido (mais de 30 dias) conta como "sem dados": o componente
// da lista busca de novo no Google, só para esses.
function montarLeads(linhas: Linha[], vendas: LinhaVenda[]): LeadSalvo[] {
  const vendaPorLead = new Map<string, VendaResumo>(
    vendas.map((v) => [v.place_id, { siteUrl: v.site_url, fechadoEm: v.fechado_em, status: v.status }]),
  );
  return linhas.map((l) => ({
    placeId: l.place_id,
    desbloqueadoEm: l.desbloqueado_em,
    dados: l.dados && cacheValido(l.dados_atualizados_em) ? l.dados : null,
    situacao: situacaoFunilValida(l.situacao) ? l.situacao : "desbloqueado",
    anotacao: l.anotacao ?? null,
    ultimoContatoEm: l.ultimo_contato_em ?? null,
    venda: vendaPorLead.get(l.place_id) ?? null,
  }));
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div>
      <TituloPagina titulo="Meus leads" />
      <p className="mt-4 text-ink-2">{texto}</p>
    </div>
  );
}
