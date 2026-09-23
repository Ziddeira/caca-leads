// Peças visuais repetidas em várias telas: classes de botão, campo e
// cartão, título de página e estado vazio. Mantém a mesma cara em tudo.
import type { ReactNode } from "react";

// Área de toque mínima de 44px (min-h-11) em tudo que é clicável.
export const BOTAO =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-ink shadow-sm transition hover:brightness-110 active:brightness-95 disabled:cursor-wait disabled:opacity-70";
export const BOTAO_SECUNDARIO =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink-2 transition hover:bg-canvas hover:text-ink disabled:cursor-wait disabled:opacity-70";
export const BOTAO_WHATSAPP =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-wa px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110";
export const CAMPO =
  "min-h-11 w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink outline-none transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary-soft";
export const ROTULO = "mb-1.5 block text-sm font-semibold text-ink-2";
export const CARTAO = "rounded-lg border border-line bg-surface shadow-cartao";
export const ALERTA_ERRO =
  "rounded-md border border-[#F6CACA] bg-danger-soft px-3 py-2.5 text-sm text-danger";
export const ALERTA_AVISO =
  "rounded-md border border-hot/30 bg-hot-soft px-3 py-2.5 text-sm text-hot-ink";
export const ALERTA_SUCESSO =
  "rounded-md border border-wa/30 bg-wa-soft px-3 py-2.5 text-sm text-wa";

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
        <h1 className="text-3xl font-extrabold text-ink sm:text-4xl">{titulo}</h1>
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
  children,
}: {
  icone?: ReactNode;
  titulo: string;
  texto: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line bg-surface px-6 py-12 text-center">
      {icone && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          {icone}
        </div>
      )}
      <h2 className="text-lg font-bold text-ink">{titulo}</h2>
      <p className="mt-1.5 max-w-md text-sm text-ink-2">{texto}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
