import { createClient } from "@/lib/supabase/server";
import { detalhesLugar, ErroGooglePlaces } from "@/lib/leads/google";
import { celularBrasileiro, classificar, extrairBairro, nomePlataforma } from "@/lib/leads/classificacao";
import { MSG_PADRAO_HOSPEDAGEM, MSG_PADRAO_NEGOCIOS, linkWhatsapp, montarMensagem } from "@/lib/leads/mensagens";
import EtiquetaSituacao from "@/components/leads/EtiquetaSituacao";

export const dynamic = "force-dynamic";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

interface LeadDesbloqueado {
  placeId: string;
  desbloqueadoEm: string;
  nome: string;
  bairro: string;
  nota: number;
  avaliacoes: number;
  situacao: ReturnType<typeof classificar>;
  plataforma: string | null;
  telefone: string | null;
  whatsapp: string | null;
  site: string | null;
  maps: string | null;
  erro?: string;
}

export default async function MeusLeadsPage() {
  const supabase = await createClient();
  if (!supabase) {
    return <Aviso texto="Supabase não configurado neste ambiente." />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: linhas, error } = await supabase
    .from("leads_desbloqueados")
    .select("place_id, desbloqueado_em")
    .order("desbloqueado_em", { ascending: false });

  if (error) {
    return <Aviso texto="Não foi possível carregar seus leads desbloqueados agora." />;
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Meus leads</h1>
      <p className="mt-2 text-ink-2">
        {linhas?.length
          ? `${linhas.length} lead(s) desbloqueado(s).`
          : "Você ainda não desbloqueou nenhum lead."}
      </p>

      {!linhas?.length ? (
        <p className="mt-2 text-ink-2">
          Vá em <strong>Buscar</strong> para encontrar leads e desbloquear os que interessarem.
        </p>
      ) : !process.env.GOOGLE_PLACES_API_KEY ? (
        <Aviso texto="GOOGLE_PLACES_API_KEY não configurada no servidor." />
      ) : (
        <ListaLeads userId={user.id} linhas={linhas} supabase={supabase} />
      )}
    </div>
  );
}

async function ListaLeads({
  userId,
  linhas,
  supabase,
}: {
  userId: string;
  linhas: { place_id: string; desbloqueado_em: string }[];
  supabase: SupabaseServerClient;
}) {
  const leads = await Promise.all(
    linhas.map((linha) => buscarDadosLead(userId, linha, supabase)),
  );

  return (
    <div className="mt-6 flex flex-col gap-3">
      {leads.map((lead) => (
        <LeadDesbloqueadoCard key={lead.placeId} lead={lead} />
      ))}
    </div>
  );
}

async function buscarDadosLead(
  userId: string,
  linha: { place_id: string; desbloqueado_em: string },
  supabase: SupabaseServerClient,
): Promise<LeadDesbloqueado> {
  try {
    const lugar = await detalhesLugar(linha.place_id);
    await supabase.from("chamadas_google").insert({ user_id: userId, tipo: "place_details" });
    const situacao = classificar(lugar.websiteUri);
    const ehPlataforma = situacao === "booking" || situacao === "rede_social";
    return {
      placeId: linha.place_id,
      desbloqueadoEm: linha.desbloqueado_em,
      nome: lugar.displayName?.text || "Sem nome",
      bairro: extrairBairro(lugar.addressComponents, lugar.formattedAddress),
      nota: lugar.rating || 0,
      avaliacoes: lugar.userRatingCount || 0,
      situacao,
      plataforma: ehPlataforma && lugar.websiteUri ? nomePlataforma(lugar.websiteUri) : null,
      telefone: lugar.nationalPhoneNumber || lugar.internationalPhoneNumber || null,
      whatsapp: celularBrasileiro(lugar.nationalPhoneNumber, lugar.internationalPhoneNumber),
      site: lugar.websiteUri || null,
      maps: lugar.googleMapsUri || null,
    };
  } catch (e) {
    const msg = e instanceof ErroGooglePlaces ? e.message : "Erro ao buscar dados no Google.";
    return {
      placeId: linha.place_id,
      desbloqueadoEm: linha.desbloqueado_em,
      nome: "Lead desbloqueado",
      bairro: "",
      nota: 0,
      avaliacoes: 0,
      situacao: "sem_site",
      plataforma: null,
      telefone: null,
      whatsapp: null,
      site: null,
      maps: null,
      erro: msg,
    };
  }
}

function LeadDesbloqueadoCard({ lead }: { lead: LeadDesbloqueado }) {
  const eHospedagem = lead.situacao === "booking";
  const modeloMsg = eHospedagem ? MSG_PADRAO_HOSPEDAGEM : MSG_PADRAO_NEGOCIOS;
  const plataforma = lead.plataforma || (eHospedagem ? "Airbnb ou Booking" : "redes sociais");

  return (
    <article className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-ink">{lead.nome}</h3>
          <EtiquetaSituacao situacao={lead.situacao} plataforma={lead.plataforma} />
        </div>
        <p className="mt-1 text-sm text-ink-2">{lead.bairro}</p>
        {lead.erro ? (
          <p className="mt-1 text-sm text-danger">{lead.erro}</p>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-2">
            {lead.nota > 0 && (
              <span>
                <span className="text-hot">★</span> {lead.nota.toFixed(1).replace(".", ",")}{" "}
                <span className="text-muted">({lead.avaliacoes})</span>
              </span>
            )}
            <span>{lead.telefone || "Sem telefone"}</span>
          </div>
        )}
        <p className="mt-1 text-xs text-muted">
          Desbloqueado em {new Date(lead.desbloqueadoEm).toLocaleDateString("pt-BR")}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {lead.whatsapp && (
          <a
            target="_blank"
            rel="noopener"
            href={linkWhatsapp(lead.whatsapp, montarMensagem(modeloMsg, lead.nome, plataforma))}
            className="rounded-md bg-wa px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            WhatsApp
          </a>
        )}
        {lead.maps && (
          <a
            target="_blank"
            rel="noopener"
            href={lead.maps}
            className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-canvas"
          >
            Maps
          </a>
        )}
        {lead.site && (
          <a
            target="_blank"
            rel="noopener"
            href={lead.site}
            className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-canvas"
          >
            Link
          </a>
        )}
      </div>
    </article>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Meus leads</h1>
      <p className="mt-2 text-ink-2">{texto}</p>
    </div>
  );
}
