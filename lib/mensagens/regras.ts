// Regras das Mensagens (chat privado) usadas na tela e nas rotas. Quem
// decide de verdade é o banco (supabase/etapa16-*.sql): mantenha estes
// números iguais aos da função SQL chat_limites() e chat_versao_regras().

export const MENSAGEM_MAX = 1000;
export const DETALHE_DENUNCIA_MAX = 500;
export const NOTA_MODERACAO_MAX = 500;
export const BUSCA_MAX = 40;

export const IMAGEM_MAX_BYTES = 5 * 1024 * 1024;
export const MENSAGENS_BUCKET = "mensagens";
// Validade do link temporário das imagens (o bucket é privado).
export const LINK_IMAGEM_SEG = 60 * 60;

export const LIMITES = {
  pedidosDia: 10,
  pedidosPendentes: 20,
  mensagensMinuto: 20,
  conversasGratis: 3,
  denunciasDia: 10,
  diasNovoPedido: 30,
};

export const MOTIVOS_DENUNCIA = {
  assedio: "Assédio ou insistência",
  spam: "Spam ou propaganda",
  ofensivo: "Ofensivo ou discurso de ódio",
  golpe: "Golpe ou fraude",
  improprio: "Conteúdo impróprio",
  outro: "Outro motivo",
} as const;
export type MotivoDenuncia = keyof typeof MOTIVOS_DENUNCIA;

export function ehMotivoDenuncia(v: unknown): v is MotivoDenuncia {
  return typeof v === "string" && v in MOTIVOS_DENUNCIA;
}

// Versão das regras. Mudou o texto e quer que todo mundo aceite de novo?
// Aumente aqui e em chat_versao_regras() (etapa16-1).
export const VERSAO_REGRAS = 1;

// O aviso de que conversas denunciadas são lidas pela administração
// está aqui, nos termos que cada pessoa aceita antes do primeiro pedido
// ou do primeiro aceite.
export const REGRAS_MENSAGENS = [
  {
    titulo: "Só com quem aceitou",
    texto:
      "Uma conversa só começa depois que a outra pessoa aceita o seu pedido. Enquanto ela não aceitar, nada do que você escrever é entregue.",
  },
  {
    titulo: "Respeito e nada de assédio",
    texto:
      "Recusou ou desfez a conversa? Respeite. Nada de insistir, ofender, mandar propaganda, golpe ou conteúdo impróprio.",
  },
  {
    titulo: "Proteja seus dados",
    texto:
      "Não mande senha, dados de cartão nem dados dos seus clientes. Desconfie de quem pede pagamento adiantado.",
  },
  {
    titulo: "Conversas denunciadas são lidas",
    texto:
      "Suas conversas são privadas: nem a administração do Ártemis lê o que vocês escrevem. A exceção é a denúncia: quando alguém denuncia uma conversa, as últimas mensagens dela (das duas pessoas, com as imagens) são enviadas para a administração, que lê e pode suspender quem quebrou as regras.",
  },
  {
    titulo: "Você está no controle",
    texto:
      "Você pode desfazer uma conversa, bloquear alguém (a pessoa some das suas conversas e não consegue mais te mandar pedido) e denunciar a qualquer momento.",
  },
];

// Erros do banco (códigos próprios, os mesmos da Comunidade) → o que a
// tela faz: assinar (convite para o Solo/Pro), regras (abre as regras),
// suspenso e limite (só mostra a mensagem).
export type CodigoChat = "assinar" | "regras" | "suspenso" | "limite";

export const MSG_FALTA_ETAPA16 =
  "As Mensagens ainda não foram ativadas no banco. Rode as 3 partes supabase/etapa16-1, etapa16-2 e etapa16-3 no Supabase, nessa ordem.";

// Função, coluna ou tabela inexistente = script da etapa 16 não rodado.
export function faltaEtapa16(codigo: string | undefined) {
  return ["PGRST202", "PGRST205", "42883", "42703", "42P01"].includes(codigo ?? "");
}
