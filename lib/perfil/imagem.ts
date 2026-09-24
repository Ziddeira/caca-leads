// Prepara a foto no navegador ANTES de enviar: confere tipo e tamanho,
// reduz para caber em 512×512 (mantendo a proporção) e converte para
// WEBP. Navegadores que não sabem gerar WEBP recebem JPG.
import { FOTO_MAX_BYTES, FOTO_MAX_LADO, FOTO_TIPOS } from "./regras";

export class ErroFoto extends Error {}

export interface FotoPronta {
  blob: Blob;
  extensao: "webp" | "jpg";
  tipo: "image/webp" | "image/jpeg";
}

export async function prepararFoto(arquivo: File): Promise<FotoPronta> {
  if (!(FOTO_TIPOS as readonly string[]).includes(arquivo.type)) {
    throw new ErroFoto("Formato não aceito. Envie uma imagem JPG, PNG ou WEBP.");
  }
  if (arquivo.size > FOTO_MAX_BYTES) {
    throw new ErroFoto("A imagem passa de 2 MB. Escolha uma imagem menor.");
  }

  const imagem = await carregarImagem(arquivo);
  const escala = Math.min(1, FOTO_MAX_LADO / Math.max(imagem.width, imagem.height));
  const largura = Math.max(1, Math.round(imagem.width * escala));
  const altura = Math.max(1, Math.round(imagem.height * escala));

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ErroFoto("Seu navegador não conseguiu processar a imagem.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(imagem, 0, 0, largura, altura);

  const webp = await paraBlob(canvas, "image/webp");
  if (webp && webp.type === "image/webp") {
    return { blob: webp, extensao: "webp", tipo: "image/webp" };
  }

  // JPG não tem transparência: pinta o fundo de branco antes.
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, largura, altura);
  const jpg = await paraBlob(canvas, "image/jpeg");
  if (!jpg) throw new ErroFoto("Seu navegador não conseguiu processar a imagem.");
  return { blob: jpg, extensao: "jpg", tipo: "image/jpeg" };
}

function carregarImagem(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ErroFoto("Não conseguimos abrir essa imagem. Tente outra."));
    };
    img.src = url;
  });
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, 0.85));
}
