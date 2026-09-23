// Dados de um lead desbloqueado que ficam em cache no banco
// (leads_desbloqueados.dados), para a página "Meus leads" não precisar
// chamar o Google a cada visita. Ver supabase/etapa4-cache-leads-comunidade.sql.
import {
  celularBrasileiro,
  classificar,
  extrairBairro,
  nomePlataforma,
  type PlaceBruto,
  type Situacao,
} from "./classificacao";

// Política de cache da Google Maps Platform: o conteúdo (tudo menos o
// place_id) só pode ficar em cache temporário. Passado esse prazo, o
// cache é descartado e buscado de novo no Google.
export const VALIDADE_CACHE_DIAS = 30;

export interface DadosLead {
  nome: string;
  bairro: string;
  nota: number;
  avaliacoes: number;
  situacao: Situacao;
  plataforma: string | null;
  telefone: string | null;
  whatsapp: string | null;
  site: string | null;
  maps: string | null;
}

export function montarDadosLead(lugar: PlaceBruto): DadosLead {
  const situacao = classificar(lugar.websiteUri);
  const ehPlataforma = situacao === "booking" || situacao === "rede_social";
  return {
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
}

export function cacheValido(atualizadoEm: string | null | undefined, agora = Date.now()): boolean {
  if (!atualizadoEm) return false;
  const idade = agora - new Date(atualizadoEm).getTime();
  return idade < VALIDADE_CACHE_DIAS * 24 * 60 * 60 * 1000;
}
