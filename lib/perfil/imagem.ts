// Foto de perfil no navegador, ANTES de enviar:
// 1. abrirFoto: confere tipo e tamanho e carrega a imagem;
// 2. o usuário ajusta o recorte (components/RecorteFoto.tsx);
// 3. recortarFoto: gera o quadrado final, de no máximo 512×512, em WEBP.
//    Navegadores que não sabem gerar WEBP recebem JPG.
import { FOTO_MAX_BYTES, FOTO_MAX_LADO, FOTO_TIPOS } from "./regras";

export class ErroFoto extends Error {}

export interface FotoPronta {
  blob: Blob;
  extensao: "webp" | "jpg";
  tipo: "image/webp" | "image/jpeg";
}

// Quadrado a recortar, em pixels da imagem original.
export interface AreaRecorte {
  x: number;
  y: number;
  lado: number;
}

export async function abrirFoto(arquivo: File): Promise<HTMLImageElement> {
  if (!(FOTO_TIPOS as readonly string[]).includes(arquivo.type)) {
    throw new ErroFoto("Formato não aceito. Envie uma imagem JPG, PNG ou WEBP.");
  }
  if (arquivo.size > FOTO_MAX_BYTES) {
    throw new ErroFoto("A imagem passa de 2 MB. Escolha uma imagem menor.");
  }
  return carregarImagem(arquivo);
}

export async function recortarFoto(imagem: HTMLImageElement, area: AreaRecorte): Promise<FotoPronta> {
  // Não amplia fotos pequenas: só reduz até 512.
  const saida = Math.max(1, Math.min(FOTO_MAX_LADO, Math.round(area.lado)));

  const canvas = document.createElement("canvas");
  canvas.width = saida;
  canvas.height = saida;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ErroFoto("Seu navegador não conseguiu processar a imagem.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(imagem, area.x, area.y, area.lado, area.lado, 0, 0, saida, saida);

  const webp = await paraBlob(canvas, "image/webp");
  if (webp && webp.type === "image/webp") {
    return { blob: webp, extensao: "webp", tipo: "image/webp" };
  }

  // JPG não tem transparência: pinta o fundo de branco antes.
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, saida, saida);
  const jpg = await paraBlob(canvas, "image/jpeg");
  if (!jpg) throw new ErroFoto("Seu navegador não conseguiu processar a imagem.");
  return { blob: jpg, extensao: "jpg", tipo: "image/jpeg" };
}

function carregarImagem(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ErroFoto("Não conseguimos abrir essa imagem. Tente outra."));
    };
    img.src = url;
  });
}

// Libera a memória da imagem aberta (chame ao fechar o recorte).
export function liberarFoto(imagem: HTMLImageElement) {
  if (imagem.src.startsWith("blob:")) URL.revokeObjectURL(imagem.src);
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, 0.85));
}
