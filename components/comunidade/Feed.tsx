"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconeComunidade } from "@/components/Icones";
import { ALERTA_ERRO, BOTAO_NEUTRO, EstadoVazio } from "@/components/ui";
import type { Post } from "@/lib/comunidade/tipos";
import { chamarApi } from "./api";
import CartaoPost from "./CartaoPost";
import NovoPost from "./NovoPost";

// Lista de posts que carrega mais sozinha ao chegar perto do fim
// (e também tem o botão "Carregar mais", para quem prefere tocar).
//   aba "recentes": pede os posts mais antigos que o último da tela;
//   aba "alta": pede a próxima fatia do ranking das últimas 48h;
//   apelido: só os posts de uma pessoa (perfil).
export default function Feed({
  postsIniciais,
  temMaisInicial,
  aba = "recentes",
  apelido = null,
  comNovoPost = false,
  vazio,
}: {
  postsIniciais: Post[];
  temMaisInicial: boolean;
  aba?: "recentes" | "alta";
  apelido?: string | null;
  comNovoPost?: boolean;
  vazio: { titulo: string; texto: string };
}) {
  const [posts, setPosts] = useState(postsIniciais);
  const [temMais, setTemMais] = useState(temMaisInicial);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  // Quantos já vieram do ranking (a aba "Em alta" pagina por posição).
  const recebidos = useRef(postsIniciais.length);

  const carregarMais = useCallback(async () => {
    if (carregando || !temMais) return;
    setCarregando(true);
    setErro(null);
    const params = new URLSearchParams();
    if (apelido) params.set("apelido", apelido);
    else params.set("aba", aba);
    if (aba === "alta" && !apelido) params.set("offset", String(recebidos.current));
    else {
      const ultimo = posts[posts.length - 1];
      if (ultimo) params.set("cursor", String(ultimo.id));
    }
    const r = await chamarApi<{ posts: Post[]; temMais: boolean }>(`/api/comunidade/feed?${params}`);
    setCarregando(false);
    if (!r.ok || !r.dados) {
      setErro(r.erro);
      return;
    }
    recebidos.current += r.dados.posts.length;
    setPosts((atuais) => {
      const vistos = new Set(atuais.map((p) => p.id));
      return [...atuais, ...r.dados!.posts.filter((p) => !vistos.has(p.id))];
    });
    setTemMais(r.dados.temMais);
  }, [aba, apelido, carregando, posts, temMais]);

  // Carrega mais quando o fim da lista chega a ~600px da tela.
  useEffect(() => {
    const alvo = fim.current;
    if (!alvo || !temMais || erro) return;
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) void carregarMais();
    }, { rootMargin: "600px 0px" });
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [carregarMais, temMais, erro]);

  function novoNoTopo(post: Post) {
    // Na aba "Em alta" o post novo não entra no ranking na hora; mesmo
    // assim aparece no topo para a pessoa ver que deu certo.
    setPosts((atuais) => [post, ...atuais.filter((p) => p.id !== post.id)]);
  }

  function tirar(id: number) {
    setPosts((atuais) => atuais.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-4">
      {comNovoPost && <NovoPost onPublicado={novoNoTopo} />}

      {posts.length === 0 && !temMais ? (
        <EstadoVazio icone={<IconeComunidade width={26} height={26} />} titulo={vazio.titulo} texto={vazio.texto} />
      ) : (
        <ul className="space-y-4">
          {posts.map((p) => (
            <li key={p.id}>
              <CartaoPost post={p} onApagado={tirar} onRepublicado={comNovoPost ? novoNoTopo : undefined} />
            </li>
          ))}
        </ul>
      )}

      <div ref={fim} aria-hidden="true" />
      {carregando && (
        <div role="status" className="space-y-4">
          <span className="sr-only">Carregando mais posts…</span>
          <div className="esqueleto h-40 w-full" />
        </div>
      )}
      {erro && (
        <p role="alert" className={ALERTA_ERRO}>
          {erro}
        </p>
      )}
      {temMais && !carregando && (
        <div className="flex justify-center">
          <button type="button" onClick={() => void carregarMais()} className={BOTAO_NEUTRO}>
            Carregar mais
          </button>
        </div>
      )}
      {!temMais && posts.length > 0 && (
        <p className="py-4 text-center text-sm text-muted">Você chegou ao fim. Por enquanto é só!</p>
      )}
    </div>
  );
}
