import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PLANOS } from "@/lib/planos";
import type { Situacao } from "@/lib/leads/classificacao";
import EtiquetaSituacao from "@/components/leads/EtiquetaSituacao";
import { BOTAO_GRANDE, BOTAO_NEUTRO, BOTAO_SECUNDARIO, BOTAO_WHATSAPP, CARTAO, ROTULO_SECAO } from "@/components/ui";
import Logo from "@/components/marca/Logo";
import Mascote from "@/components/marca/Mascote";
import Mira from "@/components/marca/Mira";
import Score from "@/components/marca/Score";
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
      <header className="pt-seguro px-seguro relative z-10 border-b border-line-2 sm:px-6">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4">
          <Logo tamanho={22} className="sm:hidden" />
          <Logo tamanho={26} className="max-sm:hidden" />
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center px-4 font-display text-sm font-bold uppercase tracking-[0.08em] text-ink-2 transition hover:text-ink"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main>
        {/* Hero ---------------------------------------------------------- */}
        <section className="ap-grid px-seguro relative sm:px-6">
          <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-14 pb-16 pt-10 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-24 lg:pt-20">
            <div>
              <p className={ROTULO_SECAO}>Para web designers independentes</p>
              <h1 className="mt-5 text-[2.5rem] font-bold uppercase italic leading-[0.98] text-ink sm:text-6xl lg:text-[4.25rem]">
                Ache clientes que <span className="text-primary">ainda não têm site</span>.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-[1.55] text-ink-2 sm:text-[19px]">
                Busque por nicho e bairro e veja quem não tem site, quem depende do Airbnb e
                quem só usa Instagram — com o WhatsApp pronto para chamar.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/cadastro" className={BOTAO_GRANDE}>
                  Criar conta grátis
                  <IconeSeta width={18} height={18} />
                </Link>
                <Link href="/login" className={`${BOTAO_SECUNDARIO} min-h-[54px] px-[26px]! py-4! text-base!`}>
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
          <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
            <div>
              <p className={ROTULO_SECAO}>Passo a passo</p>
              <h2 className="mt-3 text-3xl text-ink sm:text-4xl">Como funciona</h2>
              <ol className="mt-8 grid gap-4 sm:grid-cols-3">
                {PASSOS.map((passo, i) => (
                  <li key={passo.titulo} className="border border-line bg-canvas p-5">
                    <span className="ap-cut-s flex h-10 w-10 items-center justify-center bg-primary font-display text-lg font-bold text-primary-ink">
                      {i + 1}
                    </span>
                    <h3 className="mt-4 text-lg text-ink">{passo.titulo}</h3>
                    <p className="mt-1.5 text-ink-2">{passo.texto}</p>
                  </li>
                ))}
              </ol>
            </div>
            <Mascote tamanho={240} className="mx-auto max-lg:order-first max-sm:hidden" />
            <Mascote tamanho={160} className="mx-auto max-lg:order-first sm:hidden" />
          </div>
        </section>
      </main>

      <footer className="px-seguro pb-seguro border-t border-line-2 bg-canvas sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 py-6 text-sm text-muted">
          <span className="flex items-center gap-3">
            <Logo variante="simbolo" tamanho={28} />
            <span>© {new Date().getFullYear()} Ártemis Prospect</span>
          </span>
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
    <figure className="mx-auto w-full min-w-0 max-w-lg lg:max-w-none">
      {/* As cantoneiras de mira ficam só aqui: é o elemento principal da tela. */}
      <Mira>
        <div className={`${CARTAO} overflow-hidden`} aria-hidden="true">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 border border-line-input bg-canvas px-3 py-2 text-sm text-campo">
              <IconeBuscar width={16} height={16} className="shrink-0 text-ink-3" />
              <span className="truncate">barbearia, manicure, pousada · Palhoça SC</span>
            </div>
            <span className="hidden shrink-0 bg-primary px-2.5 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.08em] text-primary-ink sm:inline">
              48 leads
            </span>
          </div>
          <ul className="divide-y divide-line">
            {EXEMPLOS.map((l) => (
              <li key={l.nome} className="flex items-center gap-3 px-4 py-3.5">
                <Score pontos={l.pontos} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-extrabold leading-snug text-ink">{l.nome}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
                    <EtiquetaSituacao situacao={l.situacao} plataforma={l.plataforma} />
                    <span className="inline-flex items-center gap-1">
                      <IconeEstrela width={12} height={12} className="text-ink-2" />
                      {l.nota} <span className="text-muted">({l.avaliacoes})</span>
                    </span>
                    <span className="hidden text-muted sm:inline">· {l.bairro}</span>
                  </div>
                </div>
                {l.desbloqueado ? (
                  <span className={`${BOTAO_WHATSAPP} min-h-0! shrink-0 px-2.5! py-2! text-xs!`}>
                    <IconeWhatsapp width={14} height={14} />
                    <span className="hidden sm:inline">WhatsApp</span>
                  </span>
                ) : (
                  <span className={`${BOTAO_NEUTRO} min-h-0! shrink-0 px-2.5! py-2! text-xs!`}>
                    <IconeCadeado width={13} height={13} />
                    <span className="hidden sm:inline">Desbloquear</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Mira>
      <figcaption className="mt-2 text-center text-xs text-muted">
        Exemplo ilustrativo da lista de leads.
      </figcaption>
    </figure>
  );
}
