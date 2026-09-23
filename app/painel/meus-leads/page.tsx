import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cacheValido, type DadosLead } from "@/lib/leads/dadosLead";
import { EstadoVazio, TituloPagina, BOTAO } from "@/components/ui";
import { IconeLeads, IconeSeta } from "@/components/Icones";
import MeusLeadsClient, { type LeadSalvo } from "./MeusLeadsClient";

export const dynamic = "force-dynamic";

interface Linha {
  place_id: string;
  desbloqueado_em: string;
  dados?: DadosLead | null;
  dados_atualizados_em?: string | null;
}

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
    .select("place_id, desbloqueado_em, dados, dados_atualizados_em")
    .order("desbloqueado_em", { ascending: false })
    .returns<Linha[]>();

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

  const leads = montarLeads(resposta.data ?? []);

  return (
    <div>
      <TituloPagina
        titulo="Meus leads"
        descricao={
          leads.length
            ? `${leads.length} ${leads.length === 1 ? "lead desbloqueado" : "leads desbloqueados"}, com contato pronto para chamar.`
            : "Os leads que você desbloquear ficam guardados aqui."
        }
      />

      {leads.length ? (
        <MeusLeadsClient leads={leads} />
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
function montarLeads(linhas: Linha[]): LeadSalvo[] {
  return linhas.map((l) => ({
    placeId: l.place_id,
    desbloqueadoEm: l.desbloqueado_em,
    dados: l.dados && cacheValido(l.dados_atualizados_em) ? l.dados : null,
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
