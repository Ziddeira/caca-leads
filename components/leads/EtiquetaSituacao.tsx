import type { Situacao } from "@/lib/leads/classificacao";

// Etiquetas do manual (brand/MANUAL.md, 6.3): preenchido = mais urgente;
// contorno amarelo = oportunidade; contorno branco = informativo.
// As cores de cada tema ficam em app/globals.css (--color-sem-site...).
const ESTILO: Record<Situacao, string> = {
  sem_site: "border-sem-site bg-sem-site text-sem-site-ink",
  booking: "border-booking bg-booking-soft text-booking",
  rede_social: "border-rede bg-rede-soft text-rede",
  site_proprio: "border-line-strong bg-proprio-soft text-proprio",
};

function rotulo(situacao: Situacao, plataforma: string | null): string {
  switch (situacao) {
    case "sem_site":
      return "Sem site";
    case "booking":
      return `Depende do ${plataforma || "Airbnb/Booking"}`;
    case "rede_social":
      return `Só ${plataforma || "app ou rede social"}`;
    case "site_proprio":
      return "Site próprio";
  }
}

export default function EtiquetaSituacao({
  situacao,
  plataforma,
}: {
  situacao: Situacao;
  plataforma: string | null;
}) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-[3px] font-display text-[11px] font-semibold uppercase leading-tight tracking-[0.08em] ${ESTILO[situacao]}`}
    >
      {rotulo(situacao, plataforma)}
    </span>
  );
}
