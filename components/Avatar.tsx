// Foto de perfil redonda. Sem foto, mostra a inicial do apelido num
// círculo azul-claro, no mesmo estilo dos outros destaques do site.
export default function Avatar({
  fotoUrl,
  apelido,
  tamanho = 40,
  className = "",
}: {
  fotoUrl: string | null;
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

  return (
    <span
      aria-hidden="true"
      style={{ ...estilo, fontSize: Math.round(tamanho * 0.42) }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary ${className}`}
    >
      {inicial}
    </span>
  );
}
