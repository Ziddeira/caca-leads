import type { Situacao } from "@/lib/leads/classificacao";

// Etiquetas do manual (brand/MANUAL.md, 6.3): preenchido = mais urgente;
// contorno amarelo = oportunidade; contorno branco = informativo.
const ESTILO: Record<Situacao, string> = {
  sem_site: "border-primary bg-primary text-primary-ink",
  booking: "border-primary text-primary",
  rede_social: "border-ink text-ink",
  site_proprio: "border-line-strong text-ink-2",
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
