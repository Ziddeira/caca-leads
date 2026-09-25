import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PACOTE_EXTRA, PLANOS, formatarPreco, type Plano } from "@/lib/planos";
import { DESCRICAO_SITE, NOME_SITE, TITULO_INICIO, URL_SITE, metadadosPagina } from "@/lib/site";
import type { Situacao } from "@/lib/leads/classificacao";
import EtiquetaSituacao from "@/components/leads/EtiquetaSituacao";
import { BOTAO, BOTAO_GRANDE, BOTAO_NEUTRO, BOTAO_SECUNDARIO, BOTAO_WHATSAPP, CARTAO, ROTULO_SECAO } from "@/components/ui";
import Logo from "@/components/marca/Logo";
import Mira from "@/components/marca/Mira";
import Score from "@/components/marca/Score";
import SeletorTema from "@/components/tema/SeletorTema";
import {
  IconeBuscar,
  IconeCadeado,
  IconeEstrela,
  IconeSeta,
  IconeWhatsapp,
} from "@/components/Icones";

export const metadata = metadadosPagina({ titulo: TITULO_INICIO, caminho: "/", absoluto: true });

export default async function Home() {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  if (user) {
    redirect("/painel/buscar");
  }

  const gratis = PLANOS.gratis;

  return (
    <div className="min-h-screen overflow-hidden bg-canvas">
      <script
        type="application/ld+json"
        // "<" vira \u003c para nenhum texto fechar a tag <script> antes da hora.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dadosEstruturados()).replace(/</g, "\\u003c") }}
      />
      <header className="pt-seguro px-seguro relative z-10 border-b border-line-2 sm:px-6">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4">
          <Logo tamanho={26} className="sm:hidden" />
          <Logo tamanho={34} className="max-sm:hidden" />
          <nav aria-label="Seções da página" className="flex items-center gap-1 max-md:hidden">
            {SECOES.map((secao) => (
              <a
                key={secao.id}
                href={`#${secao.id}`}
                className="inline-flex min-h-11 items-center px-3 font-display text-sm font-semibold uppercase tracking-[0.08em] text-ink-2 transition hover:text-ink"
              >
                {secao.rotulo}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <SeletorTema variante="menu" />
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center px-4 font-display text-sm font-bold uppercase tracking-[0.08em] text-ink-2 transition hover:text-ink"
            >
              Entrar
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero ---------------------------------------------------------- */}
        <section className="ap-grid px-seguro relative sm:px-6">
          <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-14 pb-16 pt-10 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-24 lg:pt-20">
            <div>
              <p className={ROTULO_SECAO}>Para web designers independentes</p>
              <h1 className="mt-5 text-[2.5rem] font-bold uppercase italic leading-[0.98] text-ink sm:text-6xl lg:text-[4.25rem]">
                Ache clientes que <span className="text-destaque">ainda não têm site</span>.
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

        {/* O que é -------------------------------------------------------- */}
        <section id="o-que-e" className="px-seguro scroll-mt-4 border-t border-line sm:px-6">
          <div className="mx-auto max-w-6xl py-16 sm:py-20">
            <p className={ROTULO_SECAO}>O que é</p>
            <h2 className="mt-3 max-w-3xl text-3xl text-ink sm:text-4xl">
              Prospecção de clientes para quem cria sites
            </h2>
            <div className="mt-6 grid gap-6 text-lg leading-[1.6] text-ink-2 lg:grid-cols-2 lg:gap-12">
              <p>
                O Ártemis Prospect é uma ferramenta de prospecção para web designers, freelancers e
                agências. Você escolhe o nicho e a região, e ele busca os negócios no Google Maps e
                mostra quais ainda não têm site próprio.
              </p>
              <p>
                Em vez de abrir perfil por perfil, você recebe uma lista pronta, com os negócios que
                mais precisam de um site no topo e o contato no WhatsApp a um clique. Menos tempo
                procurando, mais tempo vendendo.
              </p>
            </div>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SITUACOES.map((item) => (
                <li key={item.situacao} className={`${CARTAO} p-5`}>
                  <EtiquetaSituacao situacao={item.situacao} plataforma={item.plataforma} />
                  <p className="mt-3 text-ink-2">{item.texto}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Como funciona --------------------------------------------------- */}
        <section id="como-funciona" className="px-seguro scroll-mt-4 border-t border-line bg-surface sm:px-6">
          <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
            <div>
              <p className={ROTULO_SECAO}>Passo a passo</p>
              <h2 className="mt-3 text-3xl text-ink sm:text-4xl">Como funciona em 3 passos</h2>
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
            {/* A Ártemis fica só no 404 e no tour; aqui vai o símbolo da marca. */}
            <Logo variante="simbolo" tamanho={200} className="mx-auto max-lg:order-first max-sm:hidden" />
            <Logo variante="simbolo" tamanho={132} className="mx-auto max-lg:order-first sm:hidden" />
          </div>
        </section>

        {/* Planos ------------------------------------------------------------ */}
        <section id="planos" className="px-seguro scroll-mt-4 border-t border-line sm:px-6">
          <div className="mx-auto max-w-6xl py-16 sm:py-20">
            <p className={ROTULO_SECAO}>Planos</p>
            <h2 className="mt-3 text-3xl text-ink sm:text-4xl">Comece grátis, assine quando quiser</h2>
            <p className="mt-4 max-w-2xl text-lg text-ink-2">
              Pague por PIX ou cartão de crédito. Sem fidelidade: cancele quando quiser, direto no
              painel.
            </p>
            <ul className="mt-10 grid gap-4 md:grid-cols-3">
              {Object.values(PLANOS).map((plano) => (
                <CartaoPlano key={plano.id} plano={plano} destaque={plano.id === "pro"} />
              ))}
            </ul>
            <p className="mt-6 text-ink-2">
              Precisa de mais no mês? O pacote extra soma +{PACOTE_EXTRA.desbloqueios} desbloqueios e
              +{PACOTE_EXTRA.buscas} buscas por {formatarPreco(PACOTE_EXTRA.preco)}, sem assinatura.
            </p>
          </div>
        </section>

        {/* Perguntas frequentes --------------------------------------------- */}
        <section id="perguntas" className="px-seguro scroll-mt-4 border-t border-line bg-surface sm:px-6">
          <div className="mx-auto max-w-3xl py-16 sm:py-20">
            <p className={ROTULO_SECAO}>Dúvidas</p>
            <h2 className="mt-3 text-3xl text-ink sm:text-4xl">Perguntas frequentes</h2>
            <div className="mt-8 divide-y divide-line border-y border-line">
              {PERGUNTAS.map((item) => (
                <details key={item.pergunta} className="group py-1">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 text-lg font-bold text-ink [&::-webkit-details-marker]:hidden">
                    {item.pergunta}
                    <span aria-hidden="true" className="font-display text-2xl text-destaque transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="pb-4 text-ink-2">{item.resposta}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Chamada final ---------------------------------------------------- */}
        <section className="ap-grid px-seguro border-t border-line sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 py-16 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-3xl text-ink sm:text-4xl">Seu próximo cliente ainda não tem site.</h2>
              <p className="mt-3 text-lg text-ink-2">
                Crie a conta em um minuto e faça a primeira busca agora.
              </p>
            </div>
            <Link href="/cadastro" className={BOTAO_GRANDE}>
              Criar conta grátis
              <IconeSeta width={18} height={18} />
            </Link>
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

const SECOES = [
  { id: "o-que-e", rotulo: "O que é" },
  { id: "como-funciona", rotulo: "Como funciona" },
  { id: "planos", rotulo: "Planos" },
  { id: "perguntas", rotulo: "Dúvidas" },
];

const SITUACOES: { situacao: Situacao; plataforma: string | null; texto: string }[] = [
  { situacao: "sem_site", plataforma: null, texto: "O negócio aparece no Google Maps, mas não tem site nenhum." },
  { situacao: "rede_social", plataforma: "Instagram", texto: "O \"site\" é só um perfil de rede social, como Instagram ou Facebook." },
  { situacao: "booking", plataforma: "Airbnb", texto: "A hospedagem depende do Airbnb ou do Booking e paga comissão em cada reserva." },
  { situacao: "site_proprio", plataforma: null, texto: "Já tem site próprio: fica no fim da lista, para você focar em quem precisa." },
];

const PERGUNTAS = [
  {
    pergunta: "O que é o Ártemis Prospect?",
    resposta:
      "É uma ferramenta de prospecção para quem cria sites. Você busca negócios por nicho e região e vê na hora quais não têm site, quais só usam rede social e quais dependem do Airbnb ou do Booking.",
  },
  {
    pergunta: "De onde vêm os dados dos negócios?",
    resposta:
      "Das informações públicas que os próprios negócios mostram no Google Maps: nome, endereço, telefone, site e avaliações.",
  },
  {
    pergunta: "Preciso de cartão para testar?",
    resposta: `Não. A conta grátis vem com ${PLANOS.gratis.buscas} buscas e ${PLANOS.gratis.desbloqueios} desbloqueios para testar, sem cartão.`,
  },
  {
    pergunta: "O que é um desbloqueio?",
    resposta:
      "Na lista, todo negócio aparece com nome, etiqueta e pontuação. Desbloquear libera o contato completo e o botão de WhatsApp com a mensagem pronta. Cada desbloqueio usa um crédito do seu plano.",
  },
  {
    pergunta: "O que é o modo Hospedagem?",
    resposta:
      "É uma busca própria para pousadas e hospedagens que dependem do Airbnb ou do Booking, com mensagem pronta oferecendo um canal de reserva direta. Está no plano Pro.",
  },
  {
    pergunta: "Como funciona o pagamento?",
    resposta:
      "Os planos Solo e Pro são mensais e podem ser pagos por PIX ou cartão de crédito. A cada mês o saldo de buscas e desbloqueios volta ao limite do plano.",
  },
  {
    pergunta: "Posso cancelar quando quiser?",
    resposta:
      "Pode. Não há fidelidade: é só cancelar na página do plano, dentro do painel, e nenhuma nova cobrança é feita.",
  },
];

// Dados estruturados (JSON-LD) para o Google entender o que é o site:
// um aplicativo web, com os preços de cada plano.
function dadosEstruturados() {
  const logo = `${URL_SITE}/brand/icon-512.png`;
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: NOME_SITE,
    description: DESCRICAO_SITE,
    url: URL_SITE,
    image: logo,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "pt-BR",
    offers: Object.values(PLANOS).map((plano) => ({
      "@type": "Offer",
      name: `Plano ${plano.nome}`,
      price: plano.preco.toFixed(2),
      priceCurrency: "BRL",
      url: `${URL_SITE}/cadastro`,
      ...(plano.preco > 0
        ? {
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: plano.preco.toFixed(2),
              priceCurrency: "BRL",
              billingDuration: "P1M",
            },
          }
        : {}),
    })),
    publisher: {
      "@type": "Organization",
      name: NOME_SITE,
      url: URL_SITE,
      logo,
    },
  };
}

function CartaoPlano({ plano, destaque }: { plano: Plano; destaque: boolean }) {
  const pago = plano.preco > 0;
  return (
    <li className={`${CARTAO} flex flex-col p-6 ${destaque ? "border-destaque!" : ""}`}>
      <h3 className="font-display text-xl font-bold uppercase tracking-[0.08em] text-ink">{plano.nome}</h3>
      <p className="mt-3 flex items-baseline gap-1">
        <span className="font-display text-4xl font-bold text-ink">
          {pago ? formatarPreco(plano.preco) : "R$ 0"}
        </span>
        {pago && <span className="text-sm text-ink-2">/mês</span>}
      </p>
      <ul className="mt-5 flex-1 space-y-2 text-ink-2">
        <li>
          {plano.buscas} buscas{pago ? " por mês" : " para testar"}
        </li>
        <li>
          {plano.desbloqueios} desbloqueios{pago ? " por mês" : " para testar"}
        </li>
        <li>WhatsApp com mensagem pronta</li>
        <li>{plano.hospedagem ? "Modo Hospedagem incluso" : "Sem modo Hospedagem"}</li>
      </ul>
      <Link href="/cadastro" className={`${destaque ? BOTAO : BOTAO_SECUNDARIO} mt-6`}>
        {pago ? `Começar com o ${plano.nome}` : "Criar conta grátis"}
      </Link>
    </li>
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
