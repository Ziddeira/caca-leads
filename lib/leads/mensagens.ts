// Mensagens padrão de WhatsApp, portadas de caca-leads-sem-site.html.
// Use {nome} para o nome do lead e {plataforma} para onde ele aparece
// hoje (Airbnb/Booking, Instagram, "redes sociais" etc.).

export const MSG_PADRAO_NEGOCIOS =
  "Oi, tudo bem? Vi a {nome} no Google Maps e notei que vocês ainda não têm um site próprio. Trabalho com isso aqui na região. Posso te mostrar uma ideia rápida de como ficaria?";

export const MSG_PADRAO_HOSPEDAGEM =
  "Oi, tudo bem? Vi a {nome} no Google Maps e percebi que as reservas hoje passam pelo {plataforma}. Trabalho com anfitriões aqui criando um canal de reserva direta: uma página própria com calendário e reserva pelo WhatsApp, sem comissão por reserva. Ela também serve para quem já se hospedou com vocês voltar direto, sem passar pela plataforma de novo. Posso te mostrar como ficaria?";

export function montarMensagem(
  modelo: string,
  nome: string,
  plataforma: string,
): string {
  return modelo.replaceAll("{nome}", nome).replaceAll("{plataforma}", plataforma);
}

export function linkWhatsapp(celular: string, texto: string): string {
  return `https://wa.me/${celular}?text=${encodeURIComponent(texto)}`;
}
