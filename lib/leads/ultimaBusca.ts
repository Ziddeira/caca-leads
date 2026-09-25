// A última busca de cada usuário fica salva no banco (tabela
// ultima_busca), para o resultado não sumir quando ele troca de aba ou
// fecha o navegador. Ver supabase/etapa15-ultima-busca.sql.
//
// Recarregar a busca salva só LÊ o banco: não gasta busca e não chama o
// Google. A única rota que gasta busca e chama o Google continua sendo
// POST /api/leads/buscar.
import type { LeadResultado, Modo } from "./classificacao";

export interface UltimaBusca {
  termos: string[];
  areas: string[];
  modo: Modo;
  // Nulo = passou do prazo do cache do Google e a lista foi apagada.
  leads: LeadResultado[] | null;
  totalLeads: number;
  aviso: string | null;
  feitaEm: string;
  expiraEm: string;
}

// O que vem da função minha_ultima_busca().
export interface LinhaUltimaBusca {
  termos: string[];
  areas: string[];
  modo: string;
  leads: LeadResultado[] | null;
  total_leads: number;
  aviso: string | null;
  feita_em: string;
  expira_em: string;
}

export function deLinha(linha: LinhaUltimaBusca): UltimaBusca {
  return {
    termos: linha.termos ?? [],
    areas: linha.areas ?? [],
    modo: linha.modo === "hospedagem" ? "hospedagem" : "negocios",
    leads: Array.isArray(linha.leads) ? linha.leads : null,
    totalLeads: linha.total_leads ?? 0,
    aviso: linha.aviso,
    feitaEm: linha.feita_em,
    expiraEm: linha.expira_em,
  };
}

// Os dados de contato nunca vão para o banco junto com a busca: na hora
// de mostrar, vêm só do desbloqueio (leads_desbloqueados).
export function semContato(leads: LeadResultado[]): LeadResultado[] {
  return leads.map((l) => ({ ...l, contato: null, desbloqueado: undefined }));
}

const FUSO = "America/Sao_Paulo";

function diaNoFuso(data: Date): string {
  // en-CA formata como AAAA-MM-DD, bom para comparar dias.
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(data);
}

function horaNoFuso(data: Date): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(data);
  const hora = partes.find((p) => p.type === "hour")?.value ?? "00";
  const minuto = partes.find((p) => p.type === "minute")?.value ?? "00";
  return `${hora}h${minuto}`;
}

// "hoje às 14h20", "ontem às 09h05" ou "12/09 às 14h20" (com o ano, se
// não for o ano atual). Sempre no horário de Brasília, para o servidor e
// o navegador escreverem a mesma coisa.
export function quandoFoi(iso: string, agora = new Date()): string {
  const data = new Date(iso);
  const hora = horaNoFuso(data);
  const dia = diaNoFuso(data);
  if (dia === diaNoFuso(agora)) return `hoje às ${hora}`;
  const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
  if (dia === diaNoFuso(ontem)) return `ontem às ${hora}`;
  const mesmoAno = dia.slice(0, 4) === diaNoFuso(agora).slice(0, 4);
  const dataCurta = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    ...(mesmoAno ? {} : { year: "numeric" }),
  }).format(data);
  return `${dataCurta} às ${hora}`;
}

export function dataCurta(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}
