import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PLANOS } from "@/lib/planos";
import type { Situacao } from "@/lib/leads/classificacao";
import EtiquetaSituacao from "@/components/leads/EtiquetaSituacao";
import { BOTAO, BOTAO_SECUNDARIO, CARTAO } from "@/components/ui";
import {
  IconeBuscar,
  IconeCadeado,
  IconeEstrela,
  IconeSeta,
  IconeWhatsapp,
} from "@/components/Icones";

export default async function Home() {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  if (user) {
    redirect("/painel/buscar");
  }

  const gratis = PLANOS.gratis;

  return (
    <div className="min-h-screen overflow-hidden bg-canvas">
      <header className="pt-seguro px-seguro relative z-10 sm:px-6">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-principal.svg"
            alt="Caça-leads"
            width={808}
            height={212}
            className="h-10 w-auto sm:h-11"
          />
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold text-ink-2 transition hover:bg-surface hover:text-ink"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main>
        {/* Hero ---------------------------------------------------------- */}
        <section className="px-seguro relative sm:px-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-40 right-[-20%] h-[520px] w-[520px] rounded-full bg-primary-soft blur-3xl sm:right-[-5%]"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 pb-16 pt-8 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-24 lg:pt-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold text-ink-2">
                <span className="h-2 w-2 rounded-full bg-hot" aria-hidden="true" />
                Para web designers independentes
              </p>
              <h1 className="mt-5 text-[2.5rem] font-extrabold leading-[1.04] tracking-[-0.045em] text-ink sm:text-6xl lg:text-[4.25rem]">
                Ache clientes que{" "}
                <span className="text-primary underline decoration-hot decoration-[0.1em] underline-offset-[0.14em] [text-decoration-skip-ink:none]">
                  ainda não têm site
                </span>
                .
              </h1>
              <p className="mt-6 max-w-xl text-lg text-ink-2 sm:text-xl">
                Busque por nicho e bairro e veja quem não tem site, quem depende do Airbnb e
                quem só usa Instagram — com o WhatsApp pronto para chamar.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/cadastro" className={`${BOTAO} min-h-12! px-7! text-base!`}>
                  Criar conta grátis
                  <IconeSeta width={18} height={18} />
                </Link>
                <Link href="/login" className={`${BOTAO_SECUNDARIO} min-h-12! px-7! text-base!`}>
                  Já tenho conta
                </Link>
              </div>
              <p className="mt-4 text-sm text-muted">
                Comece com {gratis.buscas} buscas e {gratis.desbloqueios} desbloqueios grátis, sem
                cartão.
              </p>
            </div>

            <PreviaLeads />
          </div>
        </section>

        {/* Como funciona --------------------------------------------------- */}
        <section className="px-seguro border-t border-line bg-surface sm:px-6">
          <div className="mx-auto max-w-6xl py-16 sm:py-20">
            <h2 className="text-2xl font-extrabold text-ink sm:text-3xl">Como funciona</h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-3">
              {PASSOS.map((passo, i) => (
                <li key={passo.titulo} className="rounded-lg border border-line bg-canvas p-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-ink">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-ink">{passo.titulo}</h3>
                  <p className="mt-1.5 text-ink-2">{passo.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="px-seguro pb-seguro border-t border-line bg-surface sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 py-6 text-sm text-muted">
          <span>© {new Date().getFullYear()} Caça-leads</span>
          <span>Feito para quem cria sites.</span>
        </div>
      </footer>
    </div>
  );
}

const PASSOS = [
  {
    titulo: "Busque por nicho e bairro",
    texto: "Barbearia no Centro, pousada na praia: vários termos e regiões de uma vez.",
  },
  {
    titulo: "Veja quem precisa de site",
    texto: "Cada lead chega com etiqueta e pontuação, dos mais quentes para os mais frios.",
  },
  {
    titulo: "Chame no WhatsApp",
    texto: "Desbloqueie o contato e mande uma mensagem pronta, já com o nome do negócio.",
  },
];

// Prévia da lista de leads no hero. É um exemplo ilustrativo (nomes
// inventados), não dados reais do Google.
const EXEMPLOS: {
  nome: string;
  bairro: string;
  situacao: Situacao;
  plataforma: string | null;
  nota: string;
  avaliacoes: number;
  pontos: number;
  desbloqueado: boolean;
}[] = [
  { nome: "Barbearia Navalha de Ouro", bairro: "Centro", situacao: "sem_site", plataforma: null, nota: "4,8", avaliacoes: 212, pontos: 86, desbloqueado: true },
  { nome: "Pousada Maré Mansa", bairro: "Pinheira", situacao: "booking", plataforma: "Booking", nota: "4,7", avaliacoes: 158, pontos: 81, desbloqueado: true },
  { nome: "Studio Unhas da Bia", bairro: "Pagani", situacao: "rede_social", plataforma: "Instagram", nota: "4,9", avaliacoes: 96, pontos: 72, desbloqueado: false },
  { nome: "Auto Center Dois Irmãos", bairro: "Ponte do Imaruim", situacao: "sem_site", plataforma: null, nota: "4,5", avaliacoes: 64, pontos: 58, desbloqueado: false },
];

function PreviaLeads() {
  return (
    <figure className="relative isolate mx-auto w-full max-w-lg lg:max-w-none">
      <div
        aria-hidden="true"
        className="absolute -inset-3 -z-10 rotate-2 rounded-[22px] bg-hot-soft sm:-inset-4"
      />
      <div className={`${CARTAO} overflow-hidden`} aria-hidden="true">
        <div className="flex items-center gap-3 border-b border-line-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-canvas px-3 py-2 text-sm text-ink-2">
            <IconeBuscar width={16} height={16} className="shrink-0 text-muted" />
            <span className="truncate">barbearia, manicure, pousada · Palhoça SC</span>
          </div>
          <span className="hidden shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary sm:inline">
            48 leads
          </span>
        </div>
        <ul className="divide-y divide-line-2">
          {EXEMPLOS.map((l) => (
            <li key={l.nome} className="flex items-center gap-3 px-4 py-3.5">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                  l.pontos >= 60 ? "bg-hot-soft text-hot-ink" : "bg-canvas text-ink"
                }`}
              >
                {l.pontos}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold leading-snug text-ink">{l.nome}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
                  <EtiquetaSituacao situacao={l.situacao} plataforma={l.plataforma} />
                  <span className="inline-flex items-center gap-0.5">
                    <IconeEstrela width={12} height={12} className="text-hot" />
                    {l.nota} <span className="text-muted">({l.avaliacoes})</span>
                  </span>
                  <span className="hidden text-muted sm:inline">· {l.bairro}</span>
                </div>
              </div>
              {l.desbloqueado ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-wa px-2.5 py-2 text-xs font-semibold text-white">
                  <IconeWhatsapp width={14} height={14} />
                  <span className="hidden sm:inline">WhatsApp</span>
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-2 text-xs font-semibold text-ink-2">
                  <IconeCadeado width={14} height={14} />
                  <span className="hidden sm:inline">Desbloquear</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted">
        Exemplo ilustrativo da lista de leads.
      </figcaption>
    </figure>
  );
}
