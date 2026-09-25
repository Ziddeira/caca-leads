// Cartão cinza "piscando" no formato de um lead, mostrado enquanto os
// dados ainda estão chegando.
export default function CartaoLeadEsqueleto() {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-cartao sm:p-5" aria-hidden="true">
      <div className="flex items-start gap-3">
        <div className="esqueleto h-12 w-12 shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="esqueleto h-4 w-3/5" />
          <div className="esqueleto h-3 w-2/5" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <div className="esqueleto h-6 w-24" />
        <div className="esqueleto h-6 w-16" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="esqueleto h-11" />
        <div className="esqueleto h-11" />
        <div className="esqueleto h-11" />
      </div>
    </div>
  );
}

export function ListaEsqueleto({ quantidade = 4 }: { quantidade?: number }) {
  return (
    <div role="status" aria-live="polite" className="mt-6 grid gap-3 lg:grid-cols-2">
      <span className="sr-only">Carregando seus leads…</span>
      {Array.from({ length: quantidade }, (_, i) => (
        <CartaoLeadEsqueleto key={i} />
      ))}
    </div>
  );
}
