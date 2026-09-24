// Lembrete de retorno de cada lead (colunas leads_desbloqueados.retorno_em
// e retorno_obs) e o arquivo de agenda (.ics) do retorno, gerado aqui
// mesmo, sem biblioteca. Ver supabase/etapa10-retorno.sql.

export const MSG_FALTA_ETAPA10 =
  "O lembrete de retorno ainda não foi ativado no banco. Rode o script supabase/etapa10-retorno.sql no Supabase.";

export const OBS_RETORNO_MAX = 200;
export const DURACAO_RETORNO_MIN = 30;
export const ALARME_RETORNO_MIN = 30;

const FUSO = "America/Sao_Paulo";

export interface RetornoLead {
  em: string; // ISO (timestamptz do banco)
  obs: string | null;
}

// Dia e hora de um instante no horário de Brasília:
// { data: "2026-09-30", hora: "14:30", segundos: "00" }.
export function partesBrasilia(iso: string | Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}`, segundos: p.second };
}

// "2026-09-30" + "14:30" (horário de Brasília) → instante. O Brasil não
// tem horário de verão desde 2019, então o fuso é sempre -03:00.
export function instanteBrasilia(data: string, hora: string) {
  return new Date(`${data}T${hora}:00-03:00`);
}

export type StatusRetorno = "atrasado" | "hoje" | "futuro";

export function statusRetorno(iso: string, agora: number): StatusRetorno {
  if (new Date(iso).getTime() < agora) return "atrasado";
  return partesBrasilia(iso).data === partesBrasilia(new Date(agora)).data ? "hoje" : "futuro";
}

// "30/09 às 14:30" (com o ano, quando não é o ano corrente).
export function textoRetorno(iso: string, agora: number) {
  const { data, hora } = partesBrasilia(iso);
  const [a, m, d] = data.split("-");
  const ano = a === partesBrasilia(new Date(agora)).data.slice(0, 4) ? "" : `/${a}`;
  return `${d}/${m}${ano} às ${hora}`;
}

// Endereço do arquivo .ics do retorno (app/api/leads/retorno/ics). O "v"
// muda a cada novo horário, para nenhum navegador reaproveitar um
// arquivo antigo.
export function linkIcs(placeId: string, retornoEm: string) {
  return `/api/leads/retorno/ics?placeId=${encodeURIComponent(placeId)}&v=${new Date(retornoEm).getTime()}`;
}

export interface EventoRetorno {
  placeId: string;
  nome: string;
  telefone: string | null;
  situacao: string; // rótulo da situação no funil, ex.: "Em negociação"
  observacao: string | null;
  inicio: string; // ISO
}

export function tituloRetorno(nome: string) {
  return `Retorno: ${nome}`;
}

export function descricaoRetorno(e: EventoRetorno) {
  return [
    `Telefone: ${e.telefone || "sem telefone no Google"}`,
    `Situação: ${e.situacao}`,
    e.observacao ? `Observação: ${e.observacao}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// "20260930T143000" no horário de Brasília.
function dataHoraLocal(iso: string | Date) {
  const { data, hora, segundos } = partesBrasilia(iso);
  return `${data.replace(/-/g, "")}T${hora.replace(":", "")}${segundos}`;
}

function fimRetorno(inicio: string) {
  return new Date(new Date(inicio).getTime() + DURACAO_RETORNO_MIN * 60_000);
}

// Texto dentro do .ics: barra, ponto e vírgula, vírgula e quebra de
// linha precisam de "\" na frente (RFC 5545, seção 3.3.11).
function escaparIcs(texto: string) {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Linhas do .ics têm no máximo 75 bytes; o resto continua na linha de
// baixo, começando com um espaço. Conta em bytes (UTF-8) sem partir uma
// letra acentuada ao meio.
function dobrarLinha(linha: string) {
  const codificador = new TextEncoder();
  const partes: string[] = [];
  let atual = "";
  let bytes = 0;
  for (const letra of linha) {
    const tamanho = codificador.encode(letra).length;
    const limite = partes.length ? 74 : 75; // a continuação já gasta 1 byte com o espaço
    if (bytes + tamanho > limite) {
      partes.push(atual);
      atual = "";
      bytes = 0;
    }
    atual += letra;
    bytes += tamanho;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

// Arquivo de agenda com um evento de 30 minutos, alarme 30 minutos antes
// e fuso de São Paulo. Funciona no Apple Calendário, Google Agenda e
// Outlook.
export function montarIcs(e: EventoRetorno, agora = new Date()) {
  const carimbo = agora.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const titulo = tituloRetorno(e.nome);
  // O UID muda quando o horário muda: assim o Google Agenda não recusa
  // o arquivo novo como "evento repetido" ao remarcar.
  const uid = `retorno-${e.placeId.replace(/[^\w-]/g, "")}-${dataHoraLocal(e.inicio)}@caca-leads`;

  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Caca-leads//Retorno de lead//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-TIMEZONE:${FUSO}`,
    // Definição do fuso: -03:00 o ano todo (sem horário de verão).
    "BEGIN:VTIMEZONE",
    `TZID:${FUSO}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0300",
    "TZOFFSETTO:-0300",
    "TZNAME:-03",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${carimbo}`,
    `DTSTART;TZID=${FUSO}:${dataHoraLocal(e.inicio)}`,
    `DTEND;TZID=${FUSO}:${dataHoraLocal(fimRetorno(e.inicio))}`,
    `SUMMARY:${escaparIcs(titulo)}`,
    `DESCRIPTION:${escaparIcs(descricaoRetorno(e))}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escaparIcs(titulo)}`,
    `TRIGGER:-PT${ALARME_RETORNO_MIN}M`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return linhas.map(dobrarLinha).join("\r\n") + "\r\n";
}

// Atalho para quem usa o Google Agenda no celular Android ou no
// computador: abre o evento já preenchido, sem precisar importar arquivo.
// (O alarme fica o padrão da agenda da pessoa.)
export function linkGoogleAgenda(e: EventoRetorno) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: tituloRetorno(e.nome),
    dates: `${dataHoraLocal(e.inicio)}/${dataHoraLocal(fimRetorno(e.inicio))}`,
    ctz: FUSO,
    details: descricaoRetorno(e),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

// Nome do arquivo baixado: "retorno-padaria-do-ze.ics".
export function nomeArquivoIcs(nome: string) {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `retorno-${base || "lead"}.ics`;
}
