import Link from "next/link";
import TelaStatus from "@/components/marca/TelaStatus";
import { BOTAO } from "@/components/ui";

export default function NaoEncontrada() {
  return (
    <TelaStatus
      codigo="404"
      titulo="Essa página saiu da mira"
      texto="O endereço não existe ou mudou de lugar. Volte para o início e siga a caça por lá."
    >
      <Link href="/" className={BOTAO}>
        Voltar ao início
      </Link>
    </TelaStatus>
  );
}
