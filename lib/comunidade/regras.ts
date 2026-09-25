// Regras da Comunidade usadas na tela e nas rotas. Quem decide de verdade
// é o banco (supabase/etapa14-*.sql): mantenha estes números iguais aos
// da função SQL comunidade_limites() e comunidade_versao_regras().

export const TEXTO_MAX = 500;
export const COMENTARIO_MAX = 300;
export const DETALHE_DENUNCIA_MAX = 500;
export const MOTIVO_MODERACAO_MAX = 500;
export const LINK_MAX = 500;

export const IMAGENS_MAX = 4;
export const IMAGEM_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGEM_MAX_LADO = 1600;
export const IMAGEM_TIPOS = ["image/jpeg", "image/png", "image/webp"] as const;
export const COMUNIDADE_BUCKET = "comunidade";

export const LIMITES = {
  postsDiaGratis: 1,
  postsDia: 20,
  comentariosDia: 50,
  intervaloPostSeg: 60,
  intervaloComentarioSeg: 10,
  denunciasDia: 20,
};

export const CATEGORIAS = {
  layout: "Layout",
  ferramenta: "Ferramenta",
  duvida: "Dúvida",
  conquista: "Conquista",
} as const;
export type Categoria = keyof typeof CATEGORIAS;

export const MOTIVOS_DENUNCIA = {
  spam: "Spam ou propaganda",
  ofensivo: "Ofensivo ou discurso de ódio",
  golpe: "Golpe ou fraude",
  improprio: "Conteúdo impróprio",
  outro: "Outro motivo",
} as const;
export type MotivoDenuncia = keyof typeof MOTIVOS_DENUNCIA;

export function ehCategoria(v: unknown): v is Categoria {
  return typeof v === "string" && v in CATEGORIAS;
}

export function ehMotivoDenuncia(v: unknown): v is MotivoDenuncia {
  return typeof v === "string" && v in MOTIVOS_DENUNCIA;
}

// Link aceito: http(s), sem espaços, até 500 caracteres (igual ao banco).
export function linkValido(link: string) {
  return link.length <= LINK_MAX && /^https?:\/\/[^\s]+$/i.test(link);
}

// Versão das regras. Mudou o texto e quer que todo mundo aceite de novo?
// Aumente aqui e em comunidade_versao_regras() (etapa14-1).
export const VERSAO_REGRAS = 1;

export const REGRAS_COMUNIDADE = [
  {
    titulo: "Respeito sempre",
    texto: "Nada de ofensas, ataques pessoais, preconceito ou assédio. Critique o trabalho, nunca a pessoa.",
  },
  {
    titulo: "Sem spam",
    texto: "Não repita a mesma mensagem, não faça propaganda insistente e não poste links só para atrair cliques.",
  },
  {
    titulo: "Nada de golpe",
    texto: "É proibido vender listas de leads, pedir dados pessoais ou divulgar esquemas de dinheiro fácil.",
  },
  {
    titulo: "Proteja os clientes",
    texto: "Não publique telefone, e-mail ou dados dos seus clientes e leads. Mostre o layout, não os contatos.",
  },
  {
    titulo: "Conteúdo seu",
    texto: "Publique trabalhos, imagens e ferramentas que você tem direito de mostrar. Cite a fonte quando for de outra pessoa.",
  },
  {
    titulo: "A moderação existe",
    texto:
      "Conteúdo denunciado é analisado. Quem quebra as regras pode ter o post removido e a conta suspensa da comunidade, por um tempo ou de vez.",
  },
];

// Erros do banco (códigos próprios da etapa 14) → o que a tela faz.
//   assinar: recurso do Solo/Pro → mostra o convite para assinar;
//   regras: falta aceitar as regras → abre as regras;
//   suspenso / limite: só mostra a mensagem.
export type CodigoComunidade = "assinar" | "regras" | "suspenso" | "limite";

export const MSG_FALTA_ETAPA14 =
  "A Comunidade ainda não foi ativada no banco. Rode as 3 partes supabase/etapa14-1, etapa14-2 e etapa14-3 no Supabase, nessa ordem.";

// Função, coluna ou tabela inexistente = script da etapa 14 não rodado.
export function faltaEtapa14(codigo: string | undefined) {
  return ["PGRST202", "PGRST205", "42883", "42703", "42P01"].includes(codigo ?? "");
}
