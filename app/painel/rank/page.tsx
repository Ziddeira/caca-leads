import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { urlDaFoto } from "@/lib/perfil/dados";
import {
  MSG_FALTA_ETAPA8,
  PREMIO_POR_POSICAO,
  faltaEtapa8,
  lerMes,
  mesAtualBrasilia,
  nomeDoMes,
} from "@/lib/vendas/regras";
import AbasScore from "@/components/score/AbasScore";
import Avatar from "@/components/Avatar";
import { CARTAO, TituloPagina } from "@/components/ui";

export const dynamic = "force-dynamic";

interface LinhaRank {
  posicao: number;
  apelido: string | null;
  foto_path: string | null;
  avatar_pronto: string | null;
  vendas: number;
  premio_creditos: number;
  eh_voce: boolean;
}

// Rank mensal: só apelido, avatar e número de vendas VERIFICADAS no mês.
// Nada de valores, nome real ou e-mail — a função rank_do_mes do banco
// nem devolve esses campos. "?mes=2026-08" abre um mês já fechado.
export default async function RankPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const supabase = await createClient();
  if (!supabase) return <Aviso texto="Supabase não configurado neste ambiente." />;

  const atual = mesAtualBrasilia();
  const pedido = lerMes((await searchParams).mes);
  const mes = pedido && pedido < atual ? pedido : null;

  const [{ data: brutoRank, error }, { data: brutoMeses }] = await Promise.all([
    supabase.rpc("rank_do_mes", { p_mes: mes }),
    supabase.rpc("meses_do_rank"),
  ]);
  const linhas = brutoRank as LinhaRank[] | null;
  const meses = brutoMeses as string[] | null;
  if (error) {
    if (!faltaEtapa8(error.code)) console.error("[rank]", error.code, error.message);
    return <Aviso texto={faltaEtapa8(error.code) ? MSG_FALTA_ETAPA8 : "Não foi possível carregar o rank agora."} />;
  }

  const lista = linhas ?? [];
  const top = lista.filter((l) => l.posicao <= 10);
  const eu = lista.find((l) => l.eh_voce && l.posicao > 10);
  const estouNoTop = top.some((l) => l.eh_voce);
  const mesesFechados = (meses ?? []).filter((m) => m < atual);

  return (
    <div>
      <TituloPagina
        titulo="Rank do mês"
        descricao={
          mes
            ? `Resultado final de ${nomeDoMes(mes)}.`
            : `Vendas verificadas em ${nomeDoMes(atual)}. No dia 1º o rank zera e este mês vai para o histórico.`
        }
      />
      <div className="mt-6">
        <AbasScore atual="rank" />
      </div>

      {!mes && (
        <section className={`${CARTAO} mb-4 px-4 py-3 text-sm text-ink-2 sm:px-5`} aria-label="Prêmio do mês">
          <p className="font-semibold text-ink">Prêmio do mês</p>
          <p className="mt-1">
            Na virada do mês, o 1º lugar ganha <strong className="text-ink">{PREMIO_POR_POSICAO[0]}</strong>, o 2º{" "}
            <strong className="text-ink">{PREMIO_POR_POSICAO[1]}</strong> e o 3º{" "}
            <strong className="text-ink">{PREMIO_POR_POSICAO[2]}</strong> desbloqueios extras, que não vencem. Empate:
            fica na frente quem chegou primeiro ao número de vendas.
          </p>
        </section>
      )}

      {top.length ? (
        <ol className={`${CARTAO} divide-y divide-line-2 overflow-hidden`}>
          {top.map((l) => (
            <Linha key={l.posicao} linha={l} fotoUrl={urlDaFoto(supabase, l.foto_path)} historico={!!mes} />
          ))}
        </ol>
      ) : (
        <p className={`${CARTAO} px-5 py-8 text-center text-ink-2`}>
          {mes ? "Ninguém teve venda verificada neste mês." : "Ainda não há vendas verificadas neste mês. Seja o primeiro!"}
        </p>
      )}

      {eu && (
        <>
          <p className="my-2 text-center text-sm text-muted" aria-hidden="true">
            ⋯
          </p>
          <ol className={`${CARTAO} overflow-hidden`} aria-label="Sua posição">
            <Linha linha={eu} fotoUrl={urlDaFoto(supabase, eu.foto_path)} historico={!!mes} />
          </ol>
        </>
      )}

      {!eu && !estouNoTop && (
        <p className="mt-4 text-sm text-ink-2">
          {mes ? "Você não teve venda verificada neste mês." : "Você ainda não tem venda verificada neste mês."}{" "}
          <Link href="/painel/score" className="font-semibold text-primary underline-offset-2 hover:underline">
            Ver minhas vendas
          </Link>
        </p>
      )}

      {mesesFechados.length > 0 && (
        <nav aria-label="Histórico do rank" className="mt-8">
          <h2 className="text-lg font-bold text-ink">Meses anteriores</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {mes && (
              <li>
                <Link
                  href="/painel/rank"
                  className="inline-flex min-h-11 items-center rounded-md border border-line bg-surface px-4 text-sm font-semibold text-ink-2 hover:bg-canvas"
                >
                  Mês atual
                </Link>
              </li>
            )}
            {mesesFechados.map((m) => (
              <li key={m}>
                <Link
                  href={`/painel/rank?mes=${m.slice(0, 7)}`}
                  aria-current={m === mes ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold capitalize ${
                    m === mes ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-ink-2 hover:text-ink"
                  }`}
                >
                  {nomeDoMes(m)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

// Pódio nas cores da marca: 1º preenchido em amarelo, 2º com contorno
// amarelo e 3º com contorno branco.
const MEDALHA = [
  "ap-cut-s bg-primary text-primary-ink",
  "ap-cut-s text-primary shadow-[inset_0_0_0_2px_var(--ap-yellow)]",
  "ap-cut-s text-ink shadow-[inset_0_0_0_2px_var(--ap-white)]",
];

function Linha({ linha, fotoUrl, historico }: { linha: LinhaRank; fotoUrl: string | null; historico: boolean }) {
  const medalha = MEDALHA[linha.posicao - 1];
  return (
    <li className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${linha.eh_voce ? "bg-primary-soft" : ""}`}>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center font-display text-base font-bold tabular-nums ${
          medalha ?? "text-ink-2"
        }`}
        aria-label={`${linha.posicao}º lugar`}
      >
        {linha.posicao}
      </span>
      <Avatar fotoUrl={fotoUrl} avatarPronto={linha.avatar_pronto} apelido={linha.apelido} tamanho={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink">
          {linha.apelido ?? "Caçador"}
          {linha.eh_voce && <span className="ml-1.5 text-xs font-bold text-primary">(você)</span>}
        </span>
        {historico && linha.premio_creditos > 0 && (
          <span className="block text-xs text-muted">Ganhou {linha.premio_creditos} desbloqueios</span>
        )}
      </span>
      <span className="text-right">
        <span className="block font-display text-xl font-bold tabular-nums text-ink">{linha.vendas}</span>
        <span className="block text-xs text-muted">{linha.vendas === 1 ? "venda" : "vendas"}</span>
      </span>
    </li>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div>
      <TituloPagina titulo="Rank do mês" />
      <div className="mt-6">
        <AbasScore atual="rank" />
      </div>
      <p className="text-ink-2">{texto}</p>
    </div>
  );
}
