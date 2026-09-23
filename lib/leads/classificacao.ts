// Classificação e pontuação de leads, portadas de caca-leads-sem-site.html.

export type Modo = "negocios" | "hospedagem";

export type Situacao = "sem_site" | "booking" | "rede_social" | "site_proprio";

export interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

export interface PlaceBruto {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  businessStatus?: string;
  regularOpeningHours?: unknown;
  primaryTypeDisplayName?: { text?: string };
  addressComponents?: AddressComponent[];
}

export interface LeadResultado {
  id: string;
  nome: string;
  bairro: string;
  nota: number;
  avaliacoes: number;
  situacao: Situacao;
  plataforma: string | null;
  tipo: string;
  aberto: boolean;
  temCelular: boolean;
  temTelefone: boolean;
  pontuacao: number;
  area: string;
  modo: Modo;
  contato: ContatoLead | null;
}

export interface ContatoLead {
  telefone: string | null;
  whatsapp: string | null;
  site: string | null;
  maps: string | null;
}

// Domínios de plataformas de reserva: geram a etiqueta "Depende do
// Airbnb/Booking".
export const DOMINIOS_RESERVA = [
  "airbnb.com",
  "airbnb.com.br",
  "abnb.me",
  "booking.com",
  "expedia.com",
  "expedia.com.br",
  "hoteis.com",
  "hotels.com",
  "decolar.com",
  "vrbo.com",
  "tripadvisor.com",
  "tripadvisor.com.br",
  "trivago.com.br",
  "agoda.com",
  "hostelworld.com",
];

// Domínios de apps e redes sociais: não contam como site próprio.
export const DOMINIOS_TERCEIRO = [
  "appbarber.com.br",
  "booksy.com",
  "trinks.com",
  "avec.app",
  "salaovip.com.br",
  "simplybook.me",
  "calendly.com",
  "instagram.com",
  "facebook.com",
  "fb.com",
  "fb.me",
  "tiktok.com",
  "youtube.com",
  "linktr.ee",
  "linkin.bio",
  "bio.link",
  "beacons.ai",
  "taplink.cc",
  "carrd.co",
  "wa.me",
  "wa.link",
  "whatsapp.com",
  "api.whatsapp.com",
  "ifood.com.br",
  "aiqfome.com",
  "anota.ai",
  "goomer.app",
  "cardapioweb.com",
  "ubereats.com",
  "doctoralia.com.br",
  "boaconsulta.com",
  "google.com",
  "g.page",
  "goo.gl",
  "business.site",
  "sites.google.com",
  "wixsite.com",
  "blogspot.com",
  "wordpress.com",
  "webnode.page",
  "negocio.site",
  "bit.ly",
];

const NOMES_PLATAFORMA: Record<string, string> = {
  airbnb: "Airbnb",
  abnb: "Airbnb",
  booking: "Booking",
  expedia: "Expedia",
  hoteis: "Hoteis.com",
  hotels: "Hotels.com",
  decolar: "Decolar",
  vrbo: "Vrbo",
  tripadvisor: "TripAdvisor",
  trivago: "Trivago",
  agoda: "Agoda",
  hostelworld: "Hostelworld",
  instagram: "Instagram",
  facebook: "Facebook",
  appbarber: "AppBarber",
  booksy: "Booksy",
  linktr: "Linktree",
};

function hostDe(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function pertenceALista(host: string, lista: string[]): boolean {
  return lista.some((d) => host === d || host.endsWith("." + d));
}

export function classificar(url: string | null | undefined): Situacao {
  if (!url) return "sem_site";
  const host = hostDe(url);
  if (!host) return "sem_site";
  if (pertenceALista(host, DOMINIOS_RESERVA)) return "booking";
  if (pertenceALista(host, DOMINIOS_TERCEIRO)) return "rede_social";
  return "site_proprio";
}

export function nomePlataforma(url: string): string {
  const host = hostDe(url);
  if (!host) return "link externo";
  const chave = Object.keys(NOMES_PLATAFORMA).find(
    (k) => host.startsWith(k + ".") || host.includes("." + k + "."),
  );
  return chave ? NOMES_PLATAFORMA[chave] : host;
}

// Retorna 55 + DDD + número se o telefone parecer ser um celular
// brasileiro (13 dígitos com 9 na frente do número local), senão null.
export function celularBrasileiro(
  nacional?: string | null,
  internacional?: string | null,
): string | null {
  const origem = internacional || nacional || "";
  let digitos = origem.replace(/\D/g, "");
  if (!digitos) return null;
  if (digitos.startsWith("0")) digitos = digitos.replace(/^0+/, "");
  if (!digitos.startsWith("55")) digitos = "55" + digitos;
  const local = digitos.slice(4);
  if (digitos.length === 13 && local.startsWith("9")) return digitos;
  return null;
}

export function pontuarLead(l: {
  avaliacoes: number;
  nota: number;
  situacao: Situacao;
  celular: boolean;
  temHorario: boolean;
}): number {
  let s = 0;
  s += (Math.min(l.avaliacoes, 200) / 200) * 35;
  s += l.nota >= 4.5 ? 20 : l.nota >= 4 ? 12 : l.nota ? 5 : 0;
  s +=
    l.situacao === "booking"
      ? 25
      : l.situacao === "rede_social"
        ? 20
        : l.situacao === "sem_site"
          ? 10
          : 0;
  s += l.celular ? 15 : 0;
  s += l.temHorario ? 10 : 0;
  return Math.round(s);
}

const TIPOS_BAIRRO = ["sublocality", "sublocality_level_1", "neighborhood"];

export function extrairBairro(
  componentes?: AddressComponent[],
  enderecoCompleto?: string,
): string {
  if (componentes?.length) {
    const bairro = componentes.find((c) =>
      c.types?.some((t) => TIPOS_BAIRRO.includes(t)),
    );
    if (bairro?.longText) return bairro.longText;
    const cidade = componentes.find((c) => c.types?.includes("locality"));
    if (cidade?.longText) return cidade.longText;
  }
  if (enderecoCompleto) {
    const partes = enderecoCompleto.split(",").map((p) => p.trim());
    if (partes.length >= 2) return partes[1];
  }
  return "";
}
