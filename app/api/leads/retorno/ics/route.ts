import { createClient } from "@/lib/supabase/server";
import { cacheValido, type DadosLead } from "@/lib/leads/dadosLead";
import { ROTULO_FUNIL, situacaoFunilValida } from "@/lib/leads/funil";
import { montarIcs, nomeArquivoIcs } from "@/lib/leads/retorno";

export const dynamic = "force-dynamic";

// Entrega o arquivo de agenda (.ics) do retorno marcado num lead.
// É aberto por um link comum (não por fetch): no iPhone, o Safari vê o
// tipo "text/calendar" e abre o evento direto no app Calendário, com o
// botão "Adicionar". No computador e no Android, o arquivo é baixado e
// abre na agenda da pessoa (Google Agenda, Calendário, Outlook).
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return texto("Supabase não configurado neste ambiente.", 500);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return texto("Entre na sua conta do Ártemis Prospect e tente de novo.", 401);

  const placeId = new URL(request.url).searchParams.get("placeId")?.trim() ?? "";
  if (!placeId) return texto("Lead não informado.", 400);

  // O RLS só devolve linhas do próprio usuário. Sem o cache da etapa 4,
  // a coluna "dados" não existe: tenta de novo sem ela.
  type Linha = {
    situacao: string | null;
    retorno_em: string | null;
    retorno_obs: string | null;
    dados?: DadosLead | null;
    dados_atualizados_em?: string | null;
  };
  let resposta = await supabase
    .from("leads_desbloqueados")
    .select("situacao, retorno_em, retorno_obs, dados, dados_atualizados_em")
    .eq("place_id", placeId)
    .maybeSingle<Linha>();
  if (resposta.error) {
    resposta = await supabase
      .from("leads_desbloqueados")
      .select("situacao, retorno_em, retorno_obs")
      .eq("place_id", placeId)
      .maybeSingle<Linha>();
  }
  if (resposta.error) {
    console.error("[retorno/ics]", resposta.error.code, resposta.error.message);
    return texto("Não foi possível ler o retorno agora. Tente de novo em instantes.", 500);
  }

  const linha = resposta.data;
  if (!linha) return texto("Esse lead não está entre os seus desbloqueados.", 404);
  if (!linha.retorno_em) return texto("Esse lead não tem retorno agendado.", 404);

  const dados = linha.dados && cacheValido(linha.dados_atualizados_em) ? linha.dados : null;
  const nome = dados?.nome || "lead do Ártemis Prospect";
  const ics = montarIcs({
    placeId,
    nome,
    telefone: dados?.telefone ?? null,
    situacao: situacaoFunilValida(linha.situacao) ? ROTULO_FUNIL[linha.situacao] : ROTULO_FUNIL.desbloqueado,
    observacao: linha.retorno_obs,
    inicio: linha.retorno_em,
  });

  const arquivo = nomeArquivoIcs(nome);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // "inline" (e não "attachment"): é assim que o iPhone abre direto
      // no Calendário em vez de mandar para a pasta de downloads.
      "Content-Disposition": `inline; filename="${arquivo}"; filename*=UTF-8''${arquivo}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function texto(mensagem: string, status: number) {
  return new Response(mensagem, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
