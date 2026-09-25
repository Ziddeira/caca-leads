import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buscarTexto, ErroGooglePlaces } from "@/lib/leads/google";
import { registrarErro } from "@/lib/erros/registrar";
import { semContato } from "@/lib/leads/ultimaBusca";
import {
  celularBrasileiro,
  classificar,
  extrairBairro,
  nomePlataforma,
  pontuarLead,
  type LeadResultado,
  type Modo,
  type PlaceBruto,
} from "@/lib/leads/classificacao";

// A busca chama o Google várias vezes (até 3 páginas por termo × região)
// e espera entre páginas para o nextPageToken ficar válido — pode
// passar bem do limite padrão de execução.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LIMITE_PAGINAS = 3;
const ESPERA_PROXIMA_PAGINA_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function dividirLista(valor: unknown): string[] {
  if (typeof valor !== "string") return [];
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const parte of valor.split(",")) {
    const item = parte.trim();
    const chave = item.toLowerCase();
    if (item && !vistos.has(chave)) {
      vistos.add(chave);
      resultado.push(item);
    }
  }
  return resultado;
}

function limparMensagemPostgres(msg: string): string {
  return msg.replace(/^ERROR:\s*/i, "");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { erro: "Supabase não configurado neste ambiente." },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "É preciso estar logado." }, { status: 401 });
  }

  let corpo: { nicho?: string; areas?: string; modo?: string };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }

  const termos = dividirLista(corpo.nicho);
  const areas = dividirLista(corpo.areas);
  const modo: Modo = corpo.modo === "hospedagem" ? "hospedagem" : "negocios";

  if (!termos.length) {
    return NextResponse.json({ erro: "Digite ao menos um nicho." }, { status: 400 });
  }
  if (!areas.length) {
    return NextResponse.json({ erro: "Digite ao menos uma região." }, { status: 400 });
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json(
      { erro: "GOOGLE_PLACES_API_KEY não configurada no servidor." },
      { status: 500 },
    );
  }

  // Confere saldo, plano e o limite de 10 buscas/minuto, e já desconta
  // tudo de uma vez (função SQL "security definer" — tudo ou nada).
  const { data: saldoBruto, error: erroSaldo } = await supabase.rpc("iniciar_busca", {
    p_termos: termos,
    p_areas: areas,
    p_modo: modo,
  });

  if (erroSaldo) {
    return NextResponse.json({ erro: limparMensagemPostgres(erroSaldo.message) }, { status: 400 });
  }

  const buscasRestantes = typeof saldoBruto === "number" ? saldoBruto : Number(saldoBruto);

  const porId = new Map<string, LeadResultado>();
  const brutoPorId = new Map<string, PlaceBruto>();
  let chamadasGoogle = 0;
  const registrosChamada: PromiseLike<unknown>[] = [];
  let aviso: string | null = null;

  try {
    for (const area of areas) {
      for (const termo of termos) {
        const consulta = `${termo} em ${area}`;
        let token: string | undefined;
        let pagina = 0;
        do {
          if (token) await sleep(ESPERA_PROXIMA_PAGINA_MS);
          const dados = await buscarTexto(consulta, token);
          chamadasGoogle++;
          registrosChamada.push(
            supabase
              .from("chamadas_google")
              .insert({ user_id: user.id, tipo: "places_text_search" }),
          );
          for (const lugar of dados.places || []) {
            if (!lugar.id || porId.has(lugar.id)) continue;
            porId.set(lugar.id, montarLead(lugar, area, modo));
            brutoPorId.set(lugar.id, lugar);
          }
          token = dados.nextPageToken;
          pagina++;
        } while (token && pagina < LIMITE_PAGINAS);
      }
    }
  } catch (e) {
    aviso =
      e instanceof ErroGooglePlaces
        ? `A busca parou antes do fim: ${e.message}`
        : "A busca parou antes do fim por um erro inesperado.";
    if (!(e instanceof ErroGooglePlaces)) console.error("[leads/buscar]", e);
    await registrarErro(
      "busca",
      `A busca parou antes do fim: ${e instanceof Error ? e.message : String(e)}`,
      { termos, areas, modo, chamadas_google: chamadasGoogle, leads_ate_parar: porId.size },
      user.id,
    );
  }

  // Para quem já tinha desbloqueado algum desses leads antes, mostra o
  // contato direto (já foi pago) sem precisar clicar em Desbloquear de
  // novo e sem chamar o Place Details — os dados já vieram nesta mesma
  // resposta de busca de texto.
  if (porId.size) {
    const ids = [...porId.keys()];
    const { data: jaDesbloqueados } = await supabase
      .from("leads_desbloqueados")
      .select("place_id")
      .eq("user_id", user.id)
      .in("place_id", ids);
    for (const linha of jaDesbloqueados || []) {
      const lead = porId.get(linha.place_id);
      const bruto = brutoPorId.get(linha.place_id);
      if (lead && bruto) {
        lead.contato = {
          telefone: bruto.nationalPhoneNumber || bruto.internationalPhoneNumber || null,
          whatsapp: celularBrasileiro(bruto.nationalPhoneNumber, bruto.internationalPhoneNumber),
          site: bruto.websiteUri || null,
          maps: bruto.googleMapsUri || null,
        };
      }
    }
  }

  await Promise.allSettled(registrosChamada);

  const leads = [...porId.values()].sort((a, b) => b.pontuacao - a.pontuacao);

  // Guarda esta busca (já cobrada) como a última do usuário, no lugar da
  // anterior, para a página Buscar recarregar o resultado sem gastar
  // busca nem chamar o Google. Vai sem os contatos. Se falhar (ex.: SQL da
  // etapa 15 não rodado), o resultado aparece normalmente, só não fica
  // salvo.
  const { data: salvoBruto, error: erroSalvar } = await supabase.rpc("salvar_ultima_busca", {
    p_termos: termos,
    p_areas: areas,
    p_modo: modo,
    p_leads: semContato(leads),
    p_aviso: aviso,
  });
  if (erroSalvar) console.error("[leads/buscar] salvar_ultima_busca", erroSalvar.message);
  const salvo = (Array.isArray(salvoBruto) ? salvoBruto[0] : salvoBruto) as
    | { feita_em: string; expira_em: string }
    | null;

  return NextResponse.json({
    leads,
    buscasRestantes,
    chamadasGoogle,
    aviso,
    termos,
    areas,
    modo,
    feitaEm: salvo?.feita_em ?? new Date().toISOString(),
    expiraEm: salvo?.expira_em ?? null,
  });
}

function montarLead(p: PlaceBruto, area: string, modo: Modo): LeadResultado {
  const situacao = classificar(p.websiteUri);
  const celular = celularBrasileiro(p.nationalPhoneNumber, p.internationalPhoneNumber);
  const ehPlataforma = situacao === "booking" || situacao === "rede_social";
  return {
    id: p.id,
    nome: p.displayName?.text || "Sem nome",
    bairro: extrairBairro(p.addressComponents, p.formattedAddress),
    nota: p.rating || 0,
    avaliacoes: p.userRatingCount || 0,
    situacao,
    plataforma: ehPlataforma && p.websiteUri ? nomePlataforma(p.websiteUri) : null,
    tipo: p.primaryTypeDisplayName?.text || "",
    aberto: !p.businessStatus || p.businessStatus === "OPERATIONAL",
    temCelular: !!celular,
    temTelefone: !!(p.nationalPhoneNumber || p.internationalPhoneNumber),
    pontuacao: pontuarLead({
      avaliacoes: p.userRatingCount || 0,
      nota: p.rating || 0,
      situacao,
      celular: !!celular,
      temHorario: !!p.regularOpeningHours,
    }),
    area,
    modo,
    // Os dados de contato em si (telefone, whatsapp, site, maps) nunca
    // são preenchidos aqui: só depois do usuário desbloquear o lead.
    contato: null,
  };
}
