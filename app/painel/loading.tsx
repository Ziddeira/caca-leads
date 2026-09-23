// Esqueleto mostrado na hora ao trocar de tela no painel, enquanto os
// dados da próxima tela chegam.
export default function Carregando() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="esqueleto h-9 w-56 max-w-full" />
      <div className="esqueleto mt-3 h-4 w-80 max-w-full" />
      <div className="esqueleto mt-8 h-40 w-full rounded-lg" />
      <div className="esqueleto mt-4 h-24 w-full rounded-lg" />
    </div>
  );
}
