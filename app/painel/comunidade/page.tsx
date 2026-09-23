import { createClient } from "@/lib/supabase/server";
import IlustracaoObra from "@/components/IlustracaoObra";
import { CARTAO } from "@/components/ui";
import BotaoAvisar from "./BotaoAvisar";

export const dynamic = "force-dynamic";

export default async function ComunidadePage() {
  const supabase = await createClient();

  // Se a pessoa já clicou em "Quero ser avisado", mostra isso de cara.
  // Se a tabela ainda não existe (script da etapa 4), só trata como "não".
  let jaInscrito = false;
  if (supabase) {
    const { data } = await supabase
      .from("interesse_comunidade")
      .select("user_id")
      .limit(1)
      .maybeSingle();
    jaInscrito = !!data;
  }

  return (
    <div>
      <section className={`${CARTAO} mx-auto max-w-3xl overflow-hidden`}>
        <div className="bg-linear-to-b from-primary-soft/70 to-surface px-4 pt-8 sm:px-10">
          <IlustracaoObra className="mx-auto h-auto w-full max-w-md" />
        </div>
        <div className="px-5 pb-8 pt-2 text-center sm:px-10 sm:pb-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-hot-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-hot-ink">
            <span className="h-2 w-2 rounded-full bg-hot" aria-hidden="true" />
            Em construção
          </span>
          <h1 className="mt-4 text-3xl font-extrabold text-ink sm:text-4xl">
            A Comunidade vem aí
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base text-ink-2">
            Uma vitrine de templates feita por web designers. Veja os sites da comunidade, curta
            os que gostar e, se quiser, acesse o prompt e o design para usar nos seus trabalhos.
          </p>
          <p className="mx-auto mt-3 max-w-md text-base text-ink-2">
            Quem capta um cliente, fecha a venda e entrega o site publica o resultado aqui. Assim
            a comunidade cresce sozinha, a cada projeto. Estamos levantando as paredes e ela chega
            em breve.
          </p>
          <div className="mt-6 flex justify-center">
            <BotaoAvisar jaInscrito={jaInscrito} />
          </div>
        </div>
      </section>
    </div>
  );
}
