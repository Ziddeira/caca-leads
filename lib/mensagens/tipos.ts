// Formato do que as funções SQL da etapa 16 devolvem (chat_lista,
// chat_conversa, chat_mensagens_da_conversa…). Serve para o servidor e
// para o navegador. A outra pessoa aparece só com apelido e avatar.
import type { Autor } from "@/lib/comunidade/tipos";

export type SituacaoConversa = "pendente" | "aceita" | "recusada" | "cancelada" | "encerrada";

export interface Conversa {
  id: number;
  situacao: SituacaoConversa;
  eu_pedi: boolean;
  pedido_em: string;
  aceita_em: string | null;
  encerrada_em: string | null;
  encerrada_por_mim: boolean;
  outro: Autor;
  atualizado_em: string;
  nao_lidas: number;
  ultima: {
    texto: string;
    imagem: boolean;
    minha: boolean;
    criado_em: string;
    lida: boolean;
  } | null;
  pode_enviar: boolean;
  // Grátis com mais de 3 conversas abertas (voltou do Solo/Pro): lê,
  // mas não responde nesta.
  fora_do_limite: boolean;
  // Só em chat_conversa (a conversa aberta na tela).
  eu_bloqueei?: boolean;
}

export interface Mensagem {
  id: number;
  minha: boolean;
  texto: string;
  imagem: string | null;
  criado_em: string;
  lida_em: string | null;
}

export interface EstadoChat {
  acesso_total: boolean;
  regras_aceitas: boolean;
  suspenso: boolean;
  suspenso_ate: string | null;
  ativas: number;
  // null = sem limite (Solo e Pro).
  limite_ativas: number | null;
  pedidos_hoje: number;
  limite_pedidos: number;
  apelido: string | null;
}

// Relação com alguém, para o botão no perfil da comunidade.
export interface RelacaoChat {
  conversa_id: number | null;
  situacao: SituacaoConversa | null;
  eu_pedi: boolean;
  eu_bloqueei: boolean;
  acesso_total: boolean;
}

export interface Bloqueado {
  apelido: string | null;
  foto_path: string | null;
  avatar_pronto: string | null;
  desde: string;
}
