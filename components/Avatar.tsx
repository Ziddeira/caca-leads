import AvatarPronto from "@/components/AvatarPronto";
import { ehAvatarPronto } from "@/lib/perfil/avatares";

// Avatar redondo do usuário. Ordem de preferência: foto enviada, avatar
// pronto escolhido e, por último, a inicial do apelido num círculo
// azul-claro.
export default function Avatar({
  fotoUrl,
  avatarPronto = null,
  apelido,
  tamanho = 40,
  className = "",
}: {
  fotoUrl: string | null;
  avatarPronto?: string | null;
  apelido: string | null;
  tamanho?: number;
  className?: string;
}) {
  const inicial = (apelido?.trim()[0] ?? "?").toUpperCase();
  const estilo = { width: tamanho, height: tamanho };

  if (fotoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fotoUrl}
        alt=""
        width={tamanho}
        height={tamanho}
        style={estilo}
        className={`shrink-0 rounded-full border border-line bg-canvas object-cover ${className}`}
      />
    );
  }

  if (ehAvatarPronto(avatarPronto)) {
    return <AvatarPronto id={avatarPronto} tamanho={tamanho} className={className} />;
  }

  return (
    <span
      aria-hidden="true"
      style={{ ...estilo, fontSize: Math.round(tamanho * 0.42) }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-display font-bold text-destaque ${className}`}
    >
      {inicial}
    </span>
  );
}
