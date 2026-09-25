import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TituloPagina } from "@/components/ui";
import AbasFeed from "@/components/comunidade/AbasFeed";
import { ComunidadeProvider } from "@/components/comunidade/Contexto";
import Feed from "@/components/comunidade/Feed";
import { lerEstado } from "@/lib/comunidade/paginas";
import { MSG_FALTA_ETAPA14, faltaEtapa14 } from "@/lib/comunidade/regras";
import type { Post } from "@/lib/comunidade/tipos";

export const dynamic = "force-dynamic";

const POR_PAGINA = 15;

// Feed da comunidade. Todo mundo logado lê, curte e comenta; o que cada
// plano pode publicar é conferido pelo banco (etapa 14).
export default async function ComunidadePage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const supabase = await createClient();
  if (!supabase) return <Aviso texto="Supabase não configurado neste ambiente." />;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const aba = (await searchParams).aba === "alta" ? "alta" : "recentes";
  const [{ estado, erro }, feed] = await Promise.all([
    lerEstado(supabase),
    supabase.rpc("comunidade_feed", { p_aba: aba, p_limite: POR_PAGINA }),
  ]);
  const falha = erro ?? feed.error;
  if (falha || !estado) {
    if (!faltaEtapa14(falha?.code)) console.error("[comunidade]", falha?.code, falha?.message);
    return (
      <Aviso texto={faltaEtapa14(falha?.code) ? MSG_FALTA_ETAPA14 : "Não foi possível carregar a comunidade agora."} />
    );
  }
  const posts = (feed.data ?? []) as Post[];

  return (
    <div className="mx-auto max-w-2xl">
      <TituloPagina
        titulo="Comunidade"
        descricao="Layouts, ferramentas, dúvidas e conquistas de quem vive de fazer sites."
      >
        {estado.apelido && (
          <Link
            href={`/painel/comunidade/u/${encodeURIComponent(estado.apelido)}`}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-destaque hover:underline"
          >
            Meu perfil na comunidade
          </Link>
        )}
      </TituloPagina>
      <div className="mt-6">
        <AbasFeed atual={aba} />
        <ComunidadeProvider estado={estado} userId={user.id}>
          <Feed
            key={aba}
            postsIniciais={posts}
            temMaisInicial={posts.length === POR_PAGINA}
            aba={aba}
            comNovoPost
            vazio={
              aba === "alta"
                ? {
                    titulo: "Nada em alta agora",
                    texto: "Nenhum post recebeu curtidas ou comentários nas últimas 48 horas. Que tal começar?",
                  }
                : { titulo: "A comunidade está começando", texto: "Ainda não há posts. Seja o primeiro a publicar!" }
            }
          />
        </ComunidadeProvider>
      </div>
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div>
      <TituloPagina titulo="Comunidade" />
      <p className="mt-4 text-ink-2">{texto}</p>
    </div>
  );
}
