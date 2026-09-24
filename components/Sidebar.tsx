"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  IconeBuscar,
  IconeComunidade,
  IconeEscudo,
  IconeLeads,
  IconePerfil,
  IconePlano,
  IconeRank,
  IconeSair,
  IconeTrofeu,
} from "@/components/Icones";
import Avatar from "@/components/Avatar";
import { Sino } from "@/components/notificacoes/Notificacoes";

// "ativoEm": outras páginas que também acendem o item (no celular, o
// Score leva também ao Rank, pelas abas no topo das duas páginas).
const ITENS = [
  { href: "/painel/buscar", label: "Buscar", curto: "Buscar", Icone: IconeBuscar },
  { href: "/painel/meus-leads", label: "Meus leads", curto: "Leads", Icone: IconeLeads },
  { href: "/painel/score", label: "Score", curto: "Score", Icone: IconeTrofeu, ativoEm: ["/painel/rank"] },
  { href: "/painel/comunidade", label: "Comunidade", curto: "Comunidade", Icone: IconeComunidade },
  { href: "/painel/plano", label: "Meu plano", curto: "Plano", Icone: IconePlano },
];

// No computador, Rank tem item próprio e "Perfil" fica só aqui: no
// celular, o atalho do perfil é a foto no topo.
const ITENS_LATERAL = [
  ITENS[0],
  ITENS[1],
  { href: "/painel/score", label: "Score", curto: "Score", Icone: IconeTrofeu },
  { href: "/painel/rank", label: "Rank do mês", curto: "Rank", Icone: IconeRank },
  ITENS[3],
  ITENS[4],
  { href: "/painel/perfil", label: "Perfil", curto: "Perfil", Icone: IconePerfil },
];

const ITEM_ADMIN = { href: "/painel/admin", label: "Gestão", curto: "Gestão", Icone: IconeEscudo };

// No computador (md para cima): barra lateral fixa com a logo grande.
// No celular: barra fina no topo (logo, sino, perfil e Sair) e menu inferior fixo com
// os 5 atalhos, respeitando as áreas seguras do iPhone.
export default function Sidebar({
  email,
  apelido,
  fotoUrl,
  avatarPronto,
  admin = false,
}: {
  email: string | null;
  apelido: string | null;
  fotoUrl: string | null;
  avatarPronto: string | null;
  // Só muda o que aparece no menu; a página e o banco conferem de novo.
  admin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const ativo = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const lateral = admin ? [...ITENS_LATERAL, ITEM_ADMIN] : ITENS_LATERAL;

  return (
    <>
      {/* Computador -------------------------------------------------- */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-line bg-surface px-5 py-8 md:flex">
        <Link href="/painel/buscar" className="mb-10 block rounded-md px-2 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-principal.svg"
            alt="Caça-leads"
            width={808}
            height={212}
            className="h-auto w-full max-w-[216px]"
          />
        </Link>

        <nav aria-label="Menu principal" className="flex flex-1 flex-col gap-1">
          {lateral.map(({ href, label, Icone }) => {
            const atual = ativo(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={atual ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-semibold transition ${
                  atual
                    ? "bg-primary-soft text-primary"
                    : "text-ink-2 hover:bg-canvas hover:text-ink"
                }`}
              >
                <Icone />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-line-2 pt-4">
          <Link
            href="/painel/perfil"
            aria-current={ativo("/painel/perfil") ? "page" : undefined}
            className="mb-1 flex min-h-11 items-center gap-3 rounded-md px-3 py-2 transition hover:bg-canvas"
          >
            <Avatar
              fotoUrl={fotoUrl}
              avatarPronto={avatarPronto}
              apelido={apelido ?? email}
              tamanho={36}
            />
            <span className="min-w-0">
              {apelido && (
                <span className="block truncate text-sm font-semibold text-ink">{apelido}</span>
              )}
              {email && <span className="block truncate text-xs text-muted">{email}</span>}
            </span>
          </Link>
          <button
            onClick={sair}
            className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold text-ink-2 transition hover:bg-canvas hover:text-ink"
          >
            <IconeSair />
            Sair
          </button>
        </div>
      </aside>

      {/* Celular: topo ---------------------------------------------- */}
      <header className="pt-seguro px-seguro sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur md:hidden">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link href="/painel/buscar" className="block rounded-md py-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-principal.svg"
              alt="Caça-leads"
              width={808}
              height={212}
              className="h-10 w-auto"
            />
          </Link>
          <div className="flex items-center gap-1">
            <Sino />
            {admin && (
              <Link
                href={ITEM_ADMIN.href}
                aria-label={ITEM_ADMIN.label}
                aria-current={ativo(ITEM_ADMIN.href) ? "page" : undefined}
                className={`flex min-h-11 min-w-11 items-center justify-center rounded-md transition hover:bg-canvas ${
                  ativo(ITEM_ADMIN.href) ? "text-primary" : "text-ink-2"
                }`}
              >
                <IconeEscudo />
              </Link>
            )}
            <Link
              href="/painel/perfil"
              aria-label="Meu perfil"
              aria-current={ativo("/painel/perfil") ? "page" : undefined}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full"
            >
              <Avatar
                fotoUrl={fotoUrl}
                avatarPronto={avatarPronto}
                apelido={apelido ?? email}
                tamanho={36}
                className={ativo("/painel/perfil") ? "ring-2 ring-primary ring-offset-2" : ""}
              />
            </Link>
            <button
              onClick={sair}
              className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-ink-2 transition hover:bg-canvas"
            >
              <IconeSair />
              {/* Em telas bem estreitas fica só o ícone, para caber o sino. */}
              <span className="max-[380px]:sr-only">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Celular: menu inferior ------------------------------------- */}
      <nav
        aria-label="Menu principal"
        className="pb-seguro fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
          {ITENS.map(({ href, curto, Icone, ativoEm }) => {
            const atual = ativo(href) || (ativoEm ?? []).some(ativo);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={atual ? "page" : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-semibold transition sm:text-xs ${
                    atual ? "text-primary" : "text-ink-2"
                  }`}
                >
                  <span
                    className={`flex h-8 w-12 items-center justify-center rounded-full transition ${
                      atual ? "bg-primary-soft" : ""
                    }`}
                  >
                    <Icone />
                  </span>
                  {curto}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
