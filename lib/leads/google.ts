// Acesso à Places API (New) do Google. Só deve ser importado por código
// que roda no servidor (rotas de API, Server Components): lê
// GOOGLE_PLACES_API_KEY, que não tem prefixo NEXT_PUBLIC_ e por isso
// nunca é exposta ao navegador.
import type { PlaceBruto } from "./classificacao";

export class ErroGooglePlaces extends Error {}

function chaveApi(): string {
  const chave = process.env.GOOGLE_PLACES_API_KEY;
  if (!chave) {
    throw new ErroGooglePlaces(
      "GOOGLE_PLACES_API_KEY não configurada no servidor.",
    );
  }
  return chave;
}

const CAMPOS_BUSCA = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.regularOpeningHours",
  "places.primaryTypeDisplayName",
  "places.addressComponents",
  "nextPageToken",
].join(",");

const CAMPOS_DETALHES = [
  "id",
  "displayName",
  "formattedAddress",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "rating",
  "userRatingCount",
  "googleMapsUri",
  "addressComponents",
].join(",");

interface RespostaBusca {
  places?: PlaceBruto[];
  nextPageToken?: string;
}

export async function buscarTexto(
  query: string,
  pageToken?: string,
): Promise<RespostaBusca> {
  const body: Record<string, unknown> = {
    textQuery: query,
    languageCode: "pt-BR",
    regionCode: "BR",
    pageSize: 20,
  };
  if (pageToken) body.pageToken = pageToken;

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": chaveApi(),
      "X-Goog-FieldMask": CAMPOS_BUSCA,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const dados = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = dados?.error?.message || `Erro ${res.status} na Places API.`;
    throw new ErroGooglePlaces(msg);
  }
  return dados as RespostaBusca;
}

export async function detalhesLugar(placeId: string): Promise<PlaceBruto> {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": chaveApi(),
        "X-Goog-FieldMask": CAMPOS_DETALHES,
      },
      cache: "no-store",
    },
  );

  const dados = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = dados?.error?.message || `Erro ${res.status} na Places API.`;
    throw new ErroGooglePlaces(msg);
  }
  return dados as PlaceBruto;
}

// Só o site que o Google Maps mostra para a empresa. Usada pela
// verificação semanal das vendas (campo único = consulta mais barata).
export async function siteNoGoogle(placeId: string): Promise<string | null> {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": chaveApi(),
        "X-Goog-FieldMask": "websiteUri",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );

  const dados = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = dados?.error?.message || `Erro ${res.status} na Places API.`;
    throw new ErroGooglePlaces(msg);
  }
  return (dados as PlaceBruto).websiteUri || null;
}
