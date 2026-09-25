import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Avatar from "@/components/Avatar";
import { CARTAO } from "@/components/ui";
import { ComunidadeProvider } from "@/components/comunidade/Contexto";
import Feed from "@/components/comunidade/Feed";
import BotaoConversar from "@/components/mensagens/BotaoConversar";
import { lerEstado } from "@/lib/comunidade/paginas";
import { MSG_FALTA_ETAPA14, faltaEtapa14 } from "@/lib/comunidade/regras";
import { urlAvatar, type PerfilComunidade, type Post } from "@/lib/comunidade/tipos";
import type { RelacaoChat } from "@/lib/mensagens/tipos";

export const dynamic = "force-dynamic";

const POR_PAGINA = 15;

// Perfil público de um usuário dentro da comunidade: apelido, avatar,
// posts e — só se a pessoa permitiu no Perfil — as vendas verificadas.
// Nunca e-mail, telefone ou nome real (a função SQL nem devolve).
export default async function PerfilComunidadePage({ params }: { params: Promise<{ apelido: string }> }) {
  const apelido = decodeURIComponent((await params).apelido).slice(0, 40);

  const supabase = await createClient();
  if (!supabase) notFound();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ estado, erro }, perfil, feed, chat] = await Promise.all([
    lerEstado(supabase),
    supabase.rpc("comunidade_perfil", { p_apelido: apelido }),
    supabase.rpc("comunidade_feed", { p_apelido: apelido, p_limite: POR_PAGINA }),
    // Botão de mensagens. Sem a etapa 16 (ou no próprio perfil), volta
    // vazio e o botão não aparece.
    supabase.rpc("chat_relacao", { p_apelido: apelido }),
  ]);
  const falha = erro ?? perfil.error ?? feed.error;
  if (falha) {
    if (!faltaEtapa14(falha.code)) console.error("[comunidade/perfil]", falha.code, falha.message);
    return <p className="text-ink-2">{faltaEtapa14(falha.code) ? MSG_FALTA_ETAPA14 : "Não foi possível carregar agora."}</p>;
  }
  const p = perfil.data as PerfilComunidade | null;
  if (!p) notFound();
  const posts = (feed.data ?? []) as Post[];
  const relacao = chat.error ? null : (chat.data as RelacaoChat | null);
  const desde = new Date(p.membro_desde).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/painel/comunidade"
        className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-ink-2 hover:text-ink"
      >
        ← Voltar para a comunidade
      </Link>

      <section className={`${CARTAO} flex flex-col items-center gap-4 p-5 text-center sm:flex-row sm:text-left`}>
        <Avatar fotoUrl={urlAvatar(p.foto_path)} avatarPronto={p.avatar_pronto} apelido={p.apelido} tamanho={80} />
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-2xl font-bold text-ink">{p.apelido}</h1>
          <p className="mt-1 text-sm text-muted">No Ártemis desde {desde}</p>
          <dl className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 sm:justify-start">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Posts</dt>
              <dd className="font-display text-2xl font-bold tabular-nums text-ink">{p.posts}</dd>
            </div>
            {p.mostra_vendas && p.vendas_verificadas !== null && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Vendas verificadas</dt>
                <dd className="font-display text-2xl font-bold tabular-nums text-primary">{p.vendas_verificadas}</dd>
              </div>
            )}
          </dl>
          {p.suspenso && <p className="mt-2 text-xs font-semibold text-danger">Conta suspensa da comunidade.</p>}
          {!p.sou_eu && relacao && (
            <div className="mt-4">
              <BotaoConversar apelido={p.apelido} relacao={relacao} />
            </div>
          )}
          {p.sou_eu && !p.mostra_vendas && (
            <p className="mt-3 text-xs text-muted">
              Quer mostrar suas vendas verificadas aqui?{" "}
              <Link href="/painel/perfil#comunidade" className="font-semibold text-primary hover:underline">
                Ative no Perfil
              </Link>
              .
            </p>
          )}
        </div>
      </section>

      <h2 className="mb-3 mt-8 text-lg font-bold text-ink">Posts</h2>
      <ComunidadeProvider estado={estado} userId={user.id}>
        <Feed
          postsIniciais={posts}
          temMaisInicial={posts.length === POR_PAGINA}
          apelido={p.apelido}
          vazio={{
            titulo: "Nenhum post ainda",
            texto: p.sou_eu ? "Você ainda não publicou na comunidade." : `${p.apelido} ainda não publicou na comunidade.`,
          }}
        />
      </ComunidadeProvider>
    </div>
  );
}
