// Avatares prontos, desenhados em SVG em components/AvatarPronto.tsx.
// A lista de ids precisa ser IGUAL à da função SQL avatares_prontos()
// (supabase/etapa6-boas-vindas.sql): é ela que o banco usa para validar.
export const AVATARES_PRONTOS = [
  { id: "mira", nome: "Mira" },
  { id: "lupa", nome: "Lupa" },
  { id: "bussola", nome: "Bússola" },
  { id: "foguete", nome: "Foguete" },
  { id: "raio", nome: "Raio" },
  { id: "estrela", nome: "Estrela" },
  { id: "coroa", nome: "Coroa" },
  { id: "trofeu", nome: "Troféu" },
  { id: "diamante", nome: "Diamante" },
  { id: "chama", nome: "Chama" },
  { id: "pin", nome: "Alfinete de mapa" },
  { id: "binoculo", nome: "Binóculo" },
] as const;

export type AvatarProntoId = (typeof AVATARES_PRONTOS)[number]["id"];

export function ehAvatarPronto(valor: unknown): valor is AvatarProntoId {
  return AVATARES_PRONTOS.some((a) => a.id === valor);
}
