import { MEDIA_MAX_BYTES, MEDIA_MAX_DIMENSION, MEDIA_THUMB_MAX_BYTES } from "@casamento/shared";
import { canSendOriginal, fitWithin, thumbSize } from "./logic.ts";

/* Redução e miniatura no navegador (canvas), sem dependência. */

export interface PreparedImage {
  name: string;
  file: Blob;
  thumb: Blob;
}

async function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas"))), type, quality),
  );
}

function draw(bitmap: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

/** Codifica em WebP (ou JPEG se o navegador não gerar WebP) abaixo de `maxBytes`. */
async function encode(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob> {
  let blob: Blob | null = null;
  for (const quality of [0.88, 0.8, 0.7, 0.6, 0.5]) {
    blob = await toBlob(canvas, "image/webp", quality);
    if (blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", quality);
    if (blob.size <= maxBytes) return blob;
  }
  return blob!;
}

/** Foto reduzida (se preciso) mais a miniatura de MEDIA_THUMB_WIDTH. Lança com a causa em pt-BR. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`"${file.name}": não foi possível ler a imagem. Use JPG, PNG ou WebP.`);
  }
  try {
    let main: Blob = file;
    if (!canSendOriginal(file, bitmap.width, bitmap.height)) {
      const size = fitWithin(bitmap.width, bitmap.height, MEDIA_MAX_DIMENSION);
      main = await encode(draw(bitmap, size.width, size.height), MEDIA_MAX_BYTES);
      if (main.size > MEDIA_MAX_BYTES) {
        throw new Error(`"${file.name}": a foto continua grande demais depois de reduzida.`);
      }
    }
    const ts = thumbSize(bitmap.width, bitmap.height);
    const thumb = await encode(draw(bitmap, ts.width, ts.height), MEDIA_THUMB_MAX_BYTES);
    return { name: file.name, file: main, thumb };
  } finally {
    bitmap.close();
  }
}
