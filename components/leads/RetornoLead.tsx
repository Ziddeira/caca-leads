"use client";

// Parte do cartão do lead que mostra o retorno agendado: a data (com cor
// diferente quando é hoje ou já passou), a observação e os botões para
// adicionar à agenda ou alterar. Sem retorno, só o botão "Agendar retorno".
import { linkIcs, statusRetorno, textoRetorno, type RetornoLead as Retorno } from "@/lib/leads/retorno";
import { IconeCalendario } from "@/components/Icones";

const ESTILO = {
  atrasado: "bg-danger-soft text-danger border-danger/40",
  hoje: "bg-hot-soft text-hot-ink border-hot/50",
  futuro: "bg-canvas text-ink border-line-strong",
} as const;

const LINK = "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-2 hover:underline";

export default function RetornoLead({
  placeId,
  retorno,
  agora,
  onAgendar,
}: {
  placeId: string;
  retorno: Retorno | null;
  agora: number;
  onAgendar: () => void;
}) {
  if (!retorno) {
    return (
      <button type="button" onClick={onAgendar} className={`${LINK} mt-1`}>
        <IconeCalendario width={16} height={16} />
        Agendar retorno
      </button>
    );
  }

  const status = statusRetorno(retorno.em, agora);
  const quando = textoRetorno(retorno.em, agora);
  const rotulo =
    status === "atrasado"
      ? `Retorno atrasado: ${quando}`
      : status === "hoje"
        ? `Retorno hoje às ${quando.split(" às ")[1]}`
        : `Retorno: ${quando}`;

  return (
    <div className="mt-3">
      <p
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-1 text-sm font-semibold ${ESTILO[status]}`}
      >
        <IconeCalendario width={16} height={16} className="shrink-0" />
        {rotulo}
      </p>
      {retorno.obs && <p className="mt-1.5 whitespace-pre-line break-words text-sm text-ink-2">{retorno.obs}</p>}
      <div className="mt-1 flex flex-wrap gap-x-4">
        {status !== "atrasado" && (
          <a href={linkIcs(placeId, retorno.em)} className={LINK}>
            Adicionar ao calendário
          </a>
        )}
        <button type="button" onClick={onAgendar} className={LINK}>
          {status === "atrasado" ? "Remarcar retorno" : "Alterar"}
        </button>
      </div>
    </div>
  );
}
