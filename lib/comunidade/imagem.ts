// Imagem de post, no navegador, ANTES de enviar: confere tipo e tamanho
// (até 5 MB), reduz para no máximo 1600 px no lado maior e converte para
// WEBP (ou JPG, se o navegador não souber gerar WEBP). Assim o envio é
// rápido mesmo no 4G e o bucket guarda arquivos pequenos.
import { IMAGEM_MAX_BYTES, IMAGEM_MAX_LADO, IMAGEM_TIPOS } from "./regras";

export class ErroImagem extends Error {}

export interface ImagemPronta {
  blob: Blob;
  extensao: "webp" | "jpg";
  tipo: "image/webp" | "image/jpeg";
}

export function conferirImagem(arquivo: File) {
  if (!(IMAGEM_TIPOS as readonly string[]).includes(arquivo.type)) {
    throw new ErroImagem("Formato não aceito. Use imagens JPG, PNG ou WEBP.");
  }
  if (arquivo.size > IMAGEM_MAX_BYTES) {
    throw new ErroImagem("Cada imagem pode ter no máximo 5 MB.");
  }
}

export async function reduzirImagem(arquivo: File): Promise<ImagemPronta> {
  conferirImagem(arquivo);
  const imagem = await carregar(arquivo);
  try {
    const escala = Math.min(1, IMAGEM_MAX_LADO / Math.max(imagem.naturalWidth, imagem.naturalHeight));
    const largura = Math.max(1, Math.round(imagem.naturalWidth * escala));
    const altura = Math.max(1, Math.round(imagem.naturalHeight * escala));

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ErroImagem("Seu navegador não conseguiu processar a imagem.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imagem, 0, 0, largura, altura);

    const webp = await paraBlob(canvas, "image/webp");
    if (webp && webp.type === "image/webp") {
      return { blob: webp, extensao: "webp", tipo: "image/webp" };
    }
    // JPG não tem transparência: fundo branco por trás.
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, largura, altura);
    const jpg = await paraBlob(canvas, "image/jpeg");
    if (!jpg) throw new ErroImagem("Seu navegador não conseguiu processar a imagem.");
    return { blob: jpg, extensao: "jpg", tipo: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(imagem.src);
  }
}

// Nome do arquivo no bucket: "<id do usuário>/<data>-<sorteio>.<ext>"
// (o banco confere exatamente esse formato).
export function caminhoImagem(userId: string, extensao: string) {
  const sorteio = Math.random().toString(36).slice(2, 10).padEnd(6, "0");
  return `${userId}/${Date.now()}-${sorteio}.${extensao}`;
}

function carregar(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ErroImagem("Não conseguimos abrir essa imagem. Tente outra."));
    };
    img.src = url;
  });
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, 0.82));
}
