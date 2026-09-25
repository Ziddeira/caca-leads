import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ComunidadeProvider } from "@/components/comunidade/Contexto";
import PostUnico from "@/components/comunidade/PostUnico";
import { lerEstado } from "@/lib/comunidade/paginas";
import { MSG_FALTA_ETAPA14, faltaEtapa14 } from "@/lib/comunidade/regras";
import type { Post } from "@/lib/comunidade/tipos";

export const dynamic = "force-dynamic";

// Um post, com os comentários abertos (é para cá que o link público leva
// quem já está logado).
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const supabase = await createClient();
  if (!supabase) notFound();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ estado, erro }, { data, error }] = await Promise.all([
    lerEstado(supabase),
    supabase.rpc("comunidade_post", { p_id: id }),
  ]);
  const falha = erro ?? error;
  if (falha) {
    if (!faltaEtapa14(falha.code)) console.error("[comunidade/post]", falha.code, falha.message);
    return <p className="text-ink-2">{faltaEtapa14(falha.code) ? MSG_FALTA_ETAPA14 : "Não foi possível carregar agora."}</p>;
  }
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/painel/comunidade"
        className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-ink-2 hover:text-ink"
      >
        ← Voltar para a comunidade
      </Link>
      <ComunidadeProvider estado={estado} userId={user.id}>
        <PostUnico post={data as Post} />
      </ComunidadeProvider>
    </div>
  );
}
