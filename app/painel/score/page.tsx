import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { statusVendaValido } from "@/lib/leads/funil";
import { MSG_FALTA_ETAPA8, PONTOS_FECHADO, PONTOS_VERIFICADA, faltaEtapa8 } from "@/lib/vendas/regras";
import AbasScore from "@/components/score/AbasScore";
import { BOTAO, CARTAO, EstadoVazio, TituloPagina } from "@/components/ui";
import { IconeSeta, IconeTrofeu } from "@/components/Icones";
import ScoreClient, { type VendaScore } from "./ScoreClient";

export const dynamic = "force-dynamic";

interface Score {
  pontos: number;
  vendas_verificadas: number;
  vendas_pendentes: number;
  vendas_recusadas: number;
  verificacoes_no_mes: number;
  limite_verificacoes: number;
}

interface LinhaVenda {
  id: number;
  place_id: string;
  site_url: string;
  fechado_em: string;
  status: string;
  motivo_verificacao: string | null;
  pontos: number | null;
  tentativas: number;
  ultima_verificacao_em: string | null;
  criado_em: string;
}

// Tudo aqui é só leitura: pontos e situação vêm prontos do banco. As
// únicas ações do usuário (corrigir endereço, mandar comprovante) passam
// por rotas que chamam funções SQL que conferem tudo de novo.
export default async function ScorePage() {
  const supabase = await createClient();
  if (!supabase) return <Aviso texto="Supabase não configurado neste ambiente." />;

  const { data: score, error } = await supabase.rpc("meu_score").single<Score>();
  if (error || !score) {
    if (error && !faltaEtapa8(error.code)) console.error("[score]", error.code, error.message);
    return <Aviso texto={error && faltaEtapa8(error.code) ? MSG_FALTA_ETAPA8 : "Não foi possível carregar seu score agora."} />;
  }

  const { data: linhas } = await supabase
    .from("vendas")
    .select(
      "id, place_id, site_url, fechado_em, status, motivo_verificacao, pontos, tentativas, ultima_verificacao_em, criado_em",
    )
    .order("criado_em", { ascending: false })
    .returns<LinhaVenda[]>();

  // Nome da empresa: vem do cache do lead (etapa 4). Sem o cache, mostra
  // só o site.
  const nomes = new Map<string, string>();
  if (linhas?.length) {
    const { data: leads } = await supabase
      .from("leads_desbloqueados")
      .select("place_id, dados")
      .in("place_id", linhas.map((l) => l.place_id))
      .returns<{ place_id: string; dados: { nome?: string } | null }[]>();
    for (const l of leads ?? []) if (l.dados?.nome) nomes.set(l.place_id, l.dados.nome);
  }

  const vendas: VendaScore[] = (linhas ?? [])
    .filter((l) => statusVendaValido(l.status))
    .map((l) => ({
      id: l.id,
      placeId: l.place_id,
      nome: nomes.get(l.place_id) ?? null,
      siteUrl: l.site_url,
      fechadoEm: l.fechado_em,
      status: l.status as VendaScore["status"],
      motivo: l.motivo_verificacao,
      pontos: l.pontos ?? 0,
      tentativas: l.tentativas,
      ultimaVerificacaoEm: l.ultima_verificacao_em,
    }));

  return (
    <div>
      <TituloPagina
        titulo="Score"
        descricao="Seus pontos e a situação de cada venda. Os pontos são calculados pelo sistema a partir das vendas verificadas."
      />
      <div className="mt-6">
        <AbasScore atual="score" />
      </div>

      <section aria-label="Resumo" className="grid grid-cols-3 gap-2 sm:gap-4">
        <Numero rotulo="Pontos" valor={score.pontos} destaque />
        <Numero rotulo="Verificadas" valor={score.vendas_verificadas} />
        <Numero rotulo="Pendentes" valor={score.vendas_pendentes} />
      </section>

      <details className={`${CARTAO} mt-4 px-4 py-3 text-sm text-ink-2 sm:px-5`}>
        <summary className="min-h-11 cursor-pointer content-center font-semibold text-ink">
          Como funcionam os pontos e a verificação
        </summary>
        <ul className="mt-2 list-disc space-y-1.5 pb-2 pl-5">
          <li>
            <strong className="text-ink">+{PONTOS_FECHADO} pontos</strong> quando você marca um lead como fechado.
          </li>
          <li>
            <strong className="text-ink">+{PONTOS_VERIFICADA} pontos</strong> quando a venda é verificada. Se a venda
            for recusada, os {PONTOS_FECHADO} pontos saem.
          </li>
          <li>
            Uma vez por semana, conferimos se o site abre, se tem domínio próprio (Instagram, Linktree, Booking e afins
            não valem) e se o Google Maps da empresa já mostra esse site.
          </li>
          <li>
            Site no ar mas o Google ainda sem o endereço: fica “Aguardando o Google” e tentamos de novo nas semanas
            seguintes. Depois de 3 tentativas sem confirmar, você pode enviar um comprovante.
          </li>
          <li>
            Até {score.limite_verificacoes} verificações por mês por conta. Neste mês: {score.verificacoes_no_mes}.
          </li>
        </ul>
      </details>

      <h2 className="mt-8 text-lg font-bold text-ink">Minhas vendas</h2>
      {vendas.length ? (
        <ScoreClient vendas={vendas} />
      ) : (
        <div className="mt-4">
          <EstadoVazio
            icone={<IconeTrofeu width={26} height={26} />}
            titulo="Nenhuma venda registrada ainda"
            texto="Quando fechar um site com um lead, marque como fechado em Meus leads. A venda aparece aqui e começa a valer pontos."
          >
            <Link href="/painel/meus-leads" className={BOTAO}>
              Ir para Meus leads <IconeSeta width={18} height={18} />
            </Link>
          </EstadoVazio>
        </div>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, destaque = false }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className={`${CARTAO} px-3 py-4 sm:px-5`}>
      <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-muted">{rotulo}</p>
      <p className={`mt-1 font-display text-2xl font-bold tabular-nums sm:text-3xl ${destaque ? "text-primary" : "text-ink"}`}>{valor}</p>
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div>
      <TituloPagina titulo="Score" />
      <div className="mt-6">
        <AbasScore atual="score" />
      </div>
      <p className="text-ink-2">{texto}</p>
    </div>
  );
}
