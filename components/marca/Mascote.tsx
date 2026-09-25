// A Ártemis, mascote da marca (brand/MANUAL.md, seção 7). Ela sempre
// fica sobre fundo claro: no tema escuro vai dentro de um círculo ou de
// um card branco. Nunca recolorir nem distorcer; a proporção original
// (741 × 1024) é mantida pelo object-contain.
import Image from "next/image";

// As duas imagens têm o mesmo tamanho (741 × 1024).
const LARGURA = 741;
const ALTURA = 1024;
const IMAGEM = {
  padrao: "/brand/artemis-mascote.png",
  // Chorando: para erro e página não encontrada.
  triste: "/brand/artemis-mascote-triste.jpg",
};

export default function Mascote({
  tamanho = 160,
  forma = "circulo",
  className = "",
  prioridade = false,
  expressao = "padrao",
}: {
  // Diâmetro do círculo, ou a altura do card, em px.
  tamanho?: number;
  forma?: "circulo" | "card";
  className?: string;
  prioridade?: boolean;
  expressao?: keyof typeof IMAGEM;
}) {
  // No círculo, a figura ocupa 80% da altura para não encostar na borda.
  const altura = Math.round(tamanho * (forma === "circulo" ? 0.8 : 0.88));
  const largura = Math.round((altura * LARGURA) / ALTURA);
  const moldura = forma === "circulo" ? "rounded-full" : "ap-cut";
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden bg-white ${moldura} ${className}`}
      style={
        forma === "circulo"
          ? { width: tamanho, height: tamanho }
          : { height: tamanho, paddingInline: tamanho * 0.1 }
      }
      aria-hidden="true"
    >
      <Image
        src={IMAGEM[expressao]}
        alt=""
        width={largura}
        height={altura}
        priority={prioridade}
        className="object-contain"
        style={{ width: largura, height: altura }}
      />
    </div>
  );
}
