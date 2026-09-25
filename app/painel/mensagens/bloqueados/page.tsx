import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TituloPagina } from "@/components/ui";
import ListaBloqueados from "@/components/mensagens/ListaBloqueados";
import { MSG_FALTA_ETAPA16, faltaEtapa16 } from "@/lib/mensagens/regras";
import type { Bloqueado } from "@/lib/mensagens/tipos";

export const dynamic = "force-dynamic";

export const metadata = { title: "Bloqueados" };

// Quem você bloqueou nas Mensagens, com a opção de desbloquear.
export default async function BloqueadosPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/painel/mensagens");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("chat_bloqueados");

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/painel/mensagens"
        className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-ink-2 hover:text-ink"
      >
        ← Voltar para as mensagens
      </Link>
      <TituloPagina
        titulo="Bloqueados"
        descricao="Quem está aqui não te manda pedido de conversa, e você também não manda para essa pessoa."
      />
      <div className="mt-6">
        {error ? (
          <p className="text-ink-2">{faltaEtapa16(error.code) ? MSG_FALTA_ETAPA16 : "Não foi possível carregar agora."}</p>
        ) : (
          <ListaBloqueados inicial={(data ?? []) as Bloqueado[]} />
        )}
      </div>
    </div>
  );
}
