import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Logo from "@/components/marca/Logo";
import { BOTAO, BOTAO_SECUNDARIO } from "@/components/ui";
import CartaoPost from "@/components/comunidade/CartaoPost";
import { ComunidadeProvider } from "@/components/comunidade/Contexto";
import { urlImagem, type Post } from "@/lib/comunidade/tipos";

export const dynamic = "force-dynamic";

// Link público de um post ("Compartilhar"). Abre para qualquer pessoa,
// sem login. O visitante nunca fala direto com o banco: quem busca o post
// é o servidor, com a chave service_role, pela função
// comunidade_post_publico — que só devolve o que já é público no feed
// (apelido, avatar, texto, imagens, link, contadores) e esconde conteúdo
// removido pela moderação.
const lerPost = cache(async (id: number): Promise<Post | null> => {
  const cliente = createAdminClient() ?? (await createClient());
  if (!cliente) return null;
  const { data, error } = await cliente.rpc("comunidade_post_publico", { p_id: id });
  if (error) {
    console.error("[comunidade/publico]", error.code, error.message);
    return null;
  }
  return (data as Post | null) ?? null;
});

function lerId(valor: string) {
  const n = Number(valor);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = lerId((await params).id);
  const post = id ? await lerPost(id) : null;
  if (!post) return { title: "Post não encontrado", robots: { index: false } };

  const conteudo = post.tipo === "repost" && post.original ? post.original : post;
  const titulo = `Post de ${post.autor.apelido ?? "um usuário"} na Comunidade`;
  const descricao = (post.texto || conteudo.texto || "Veja este post na comunidade do Ártemis Prospect.").slice(0, 200);
  const imagem = conteudo.imagens[0] ? urlImagem(conteudo.imagens[0]) : null;
  return {
    title: titulo,
    description: descricao,
    robots: { index: false },
    openGraph: { title: titulo, description: descricao, ...(imagem ? { images: [imagem] } : {}) },
    twitter: { title: titulo, description: descricao, ...(imagem ? { images: [imagem] } : {}) },
  };
}

export default async function PostPublicoPage({ params }: { params: Promise<{ id: string }> }) {
  const id = lerId((await params).id);
  const post = id ? await lerPost(id) : null;
  if (!post || !id) notFound();

  const supabase = await createClient();
  const logado = supabase ? !!(await supabase.auth.getUser()).data.user : false;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="pt-seguro px-seguro border-b border-line-2 sm:px-6">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-4">
          <Link href="/" aria-label="Ártemis Prospect — início">
            <Logo tamanho={24} />
          </Link>
          {!logado && (
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center px-3 font-display text-sm font-bold uppercase tracking-[0.08em] text-ink-2 hover:text-ink"
            >
              Entrar
            </Link>
          )}
        </div>
      </header>

      <main className="px-seguro mx-auto max-w-2xl pb-[calc(3rem+env(safe-area-inset-bottom))] pt-6 sm:px-6">
        <p className="mb-4 font-display text-[13px] font-semibold uppercase tracking-[0.3em] text-destaque">
          Comunidade Ártemis
        </p>
        <ComunidadeProvider estado={null} userId={null} somenteLeitura>
          <CartaoPost post={post} />
        </ComunidadeProvider>

        <section className="mt-6 border border-line bg-surface p-5 text-center">
          {logado ? (
            <>
              <p className="text-ink-2">Curta, comente e republique direto na comunidade.</p>
              <Link href={`/painel/comunidade/post/${id}`} className={`${BOTAO} mt-4 w-full sm:w-auto`}>
                Abrir na comunidade
              </Link>
            </>
          ) : (
            <>
              <p className="text-ink-2">
                Quer curtir, comentar e trocar ideia com outros web designers? Entre na comunidade do Ártemis
                Prospect.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Link href="/cadastro" className={BOTAO}>
                  Criar conta grátis
                </Link>
                <Link href="/login" className={BOTAO_SECUNDARIO}>
                  Já tenho conta
                </Link>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
