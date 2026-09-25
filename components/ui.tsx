// Peças visuais repetidas em várias telas: classes de botão, campo e
// cartão, título de página e estado vazio. Mantém a mesma cara em tudo.
// Valores do manual da marca: brand/MANUAL.md, seção 6.
import type { ReactNode } from "react";
import Logo from "@/components/marca/Logo";

// Área de toque mínima de 44px (min-h-11) em tudo que é clicável.
// Primário: amarelo, texto preto, canto cortado. Um por tela.
export const BOTAO =
  "ap-cut inline-flex min-h-11 items-center justify-center gap-2 bg-primary px-5 py-3 text-center font-display text-sm font-bold uppercase leading-tight tracking-[0.08em] text-primary-ink transition hover:bg-primary-hover disabled:cursor-wait disabled:opacity-70";
// Primário no tamanho cheio do manual (16px, padding 17px 28px): hero e
// chamadas principais.
export const BOTAO_GRANDE = `${BOTAO} min-h-[54px] px-7! py-[17px]! text-base!`;
// Secundário: só contorno branco de 1px, sem fundo.
export const BOTAO_SECUNDARIO =
  "inline-flex min-h-11 items-center justify-center gap-2 border border-ink bg-transparent px-5 py-3 text-center font-display text-sm font-bold uppercase leading-tight tracking-[0.08em] text-ink transition hover:bg-white/[0.06] disabled:cursor-wait disabled:opacity-70";
// Neutro (Desbloquear, Maps, filtros e ações de apoio): contorno #3D3D3D,
// texto #D4D4D4.
export const BOTAO_NEUTRO =
  "inline-flex min-h-11 items-center justify-center gap-2 border border-line-strong bg-transparent px-3 py-[9px] text-center font-display text-[13px] font-semibold uppercase leading-tight tracking-[0.06em] text-campo transition hover:border-ink-2 hover:text-ink disabled:cursor-wait disabled:opacity-70";
// Ação pequena (WhatsApp): amarelo, canto cortado de 7px.
export const BOTAO_WHATSAPP =
  "ap-cut-s inline-flex min-h-11 items-center justify-center gap-2 bg-primary px-[14px] py-[10px] text-center font-display text-[13px] font-bold uppercase leading-tight tracking-[0.06em] text-primary-ink transition hover:bg-primary-hover";
// Input: fundo preto, borda #2E2E2E, texto #D4D4D4; foco com borda amarela.
export const CAMPO =
  "min-h-11 w-full border border-line-input bg-canvas px-3 py-2 text-base text-campo outline-none transition placeholder:text-ink-3 focus:border-primary";
export const ROTULO = "mb-1.5 block text-sm font-semibold text-campo";
// Rótulo de seção: Chakra Petch 600, caixa alta, espaçado, amarelo.
export const ROTULO_SECAO =
  "font-display text-[13px] font-semibold uppercase tracking-[0.3em] text-primary";
// Abas (Negócios/Hospedagem, Score/Rank, Gestão): a ativa em amarelo,
// com traço embaixo, como o item ativo da sidebar.
export const ABA_ATIVA = "bg-primary-soft text-primary shadow-[inset_0_-3px_0_var(--ap-yellow)]";
export const ABA_INATIVA = "text-ink-2 hover:bg-white/[0.04] hover:text-ink";
// Card: fundo #121212, borda 1px #262626, sem raio.
export const CARTAO = "border border-line bg-surface";
export const ALERTA_ERRO =
  "border border-danger/40 bg-danger-soft px-3 py-2.5 text-sm text-danger";
export const ALERTA_AVISO =
  "border border-primary/40 bg-primary-soft px-3 py-2.5 text-sm text-primary";
export const ALERTA_SUCESSO =
  "border border-ink/30 bg-wa-soft px-3 py-2.5 text-sm text-ink";

export function TituloPagina({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[2rem] leading-tight text-ink sm:text-4xl lg:text-[2.625rem]">{titulo}</h1>
        {descricao && <p className="mt-2 max-w-2xl text-base text-ink-2">{descricao}</p>}
      </div>
      {children}
    </header>
  );
}

export function EstadoVazio({
  icone,
  titulo,
  texto,
  logo = false,
  children,
}: {
  icone?: ReactNode;
  titulo: string;
  texto: ReactNode;
  // Mostra o símbolo da logo no lugar do ícone.
  logo?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center border border-dashed border-line bg-surface px-6 py-12 text-center">
      {logo ? (
        <Logo variante="simbolo" tamanho={72} className="mb-5" />
      ) : (
        icone && (
          <div className="mb-4 flex h-14 w-14 items-center justify-center border border-line-strong text-ink">
            {icone}
          </div>
        )
      )}
      <h2 className="text-lg text-ink">{titulo}</h2>
      <p className="mt-1.5 max-w-md text-sm text-ink-2">{texto}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
