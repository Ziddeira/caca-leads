// Formato dos posts e comentários que as funções SQL da etapa 14 devolvem
// (comunidade_post_json e comunidade_comentarios_do_post), e os links
// públicos das imagens. Serve para o servidor e para o navegador.
import { COMUNIDADE_BUCKET, type Categoria } from "./regras";

export interface Autor {
  apelido: string | null;
  foto_path: string | null;
  avatar_pronto: string | null;
}

export interface PreviaLink {
  titulo?: string;
  descricao?: string;
  site?: string;
}

export interface Conteudo {
  id: number;
  autor: Autor;
  texto: string;
  categoria: Categoria | null;
  imagens: string[];
  link_url: string | null;
  link_previa: PreviaLink | null;
  criado_em: string;
}

export interface Post extends Conteudo {
  tipo: "post" | "repost";
  curtidas: number;
  comentarios: number;
  reposts: number;
  eu_curti?: boolean;
  eu_repostei?: boolean;
  sou_autor?: boolean;
  pode_apagar?: boolean;
  removido?: boolean;
  // Só no repost: o post republicado (nulo = apagado ou removido).
  original: Conteudo | null;
}

export interface Comentario {
  id: number;
  autor: Autor;
  texto: string;
  criado_em: string;
  sou_autor: boolean;
  pode_apagar: boolean;
}

// O que a tela precisa saber do usuário logado (comunidade_meu_estado).
export interface EstadoComunidade {
  acesso_total: boolean;
  admin: boolean;
  regras_aceitas: boolean;
  suspenso: boolean;
  suspenso_ate: string | null;
  posts_hoje: number;
  limite_posts: number;
  apelido: string | null;
}

export interface PerfilComunidade {
  apelido: string;
  foto_path: string | null;
  avatar_pronto: string | null;
  membro_desde: string;
  posts: number;
  sou_eu: boolean;
  mostra_vendas: boolean;
  vendas_verificadas: number | null;
  suspenso: boolean | null;
}

// Os buckets "comunidade" e "avatares" são de leitura pública: o link
// da imagem sai direto do endereço do Supabase, sem consultar o banco.
function urlPublica(bucket: string, path: string | null) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  const caminho = path.split("/").map(encodeURIComponent).join("/");
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${caminho}`;
}

export function urlImagem(path: string) {
  return urlPublica(COMUNIDADE_BUCKET, path);
}

export function urlAvatar(path: string | null) {
  return urlPublica("avatares", path);
}

export function linkPublicoPost(origem: string, id: number) {
  return `${origem.replace(/\/$/, "")}/comunidade/post/${id}`;
}
