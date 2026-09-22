import type { Situacao } from "@/lib/leads/classificacao";

const ESTILO: Record<Situacao, string> = {
  sem_site: "text-sem-site bg-sem-site-soft",
  booking: "text-booking bg-booking-soft",
  rede_social: "text-rede bg-rede-soft",
  site_proprio: "text-proprio bg-proprio-soft",
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
      className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ${ESTILO[situacao]}`}
    >
      {rotulo(situacao, plataforma)}
    </span>
  );
}
