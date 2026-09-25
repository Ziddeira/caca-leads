// Aviso de limite do plano atingido, com o símbolo da marca.
// Só mostra o que o saldo já diz; quem decide o que pode ou não é o
// servidor, como sempre. O botão é secundário porque a tela já tem o
// primário (Buscar leads).
import Link from "next/link";
import Logo from "@/components/marca/Logo";
import { BOTAO_SECUNDARIO } from "@/components/ui";
import { IconeSeta } from "@/components/Icones";

export default function LimitePlano({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-5 border border-primary/40 bg-surface px-6 py-8 text-center sm:flex-row sm:text-left"
    >
      <Logo variante="simbolo" tamanho={88} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-[13px] font-semibold uppercase tracking-[0.3em] text-primary">
          Limite do plano
        </p>
        <h2 className="mt-2 text-xl text-ink">{titulo}</h2>
        <p className="mt-1.5 max-w-lg text-sm text-ink-2">{texto}</p>
      </div>
      <Link href="/painel/plano" className={`${BOTAO_SECUNDARIO} shrink-0`}>
        Ver planos <IconeSeta width={18} height={18} />
      </Link>
    </div>
  );
}
