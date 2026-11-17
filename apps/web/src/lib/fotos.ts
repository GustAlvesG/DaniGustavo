import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { imageSize, type ImageSize } from "./image-size";

/** Pasta das fotos do site: `apps/web/public/fotos` (servida em `/fotos/...`). */
const FOTOS_DIR = join(process.cwd(), "public", "fotos");

export type FotoInfo = ImageSize & { src: string };

const cache = new Map<string, FotoInfo>();

/**
 * Caminho público e tamanho de uma foto de `public/fotos`, pelo nome do
 * arquivo (o que vai em `content/home.ts`). Lido do disco no servidor, uma
 * vez por arquivo. Se o arquivo não existir, o erro diz qual nome conferir.
 */
export function foto(arquivo: string): FotoInfo {
  const hit = cache.get(arquivo);
  if (hit) return hit;
  let size: ImageSize | null;
  try {
    size = imageSize(readFileSync(join(FOTOS_DIR, arquivo)));
  } catch {
    throw new Error(
      `Foto "${arquivo}" não encontrada em apps/web/public/fotos. Confira o nome em src/content/home.ts.`,
    );
  }
  if (!size) {
    throw new Error(`Foto "${arquivo}": formato não reconhecido (use .jpg, .png ou .webp).`);
  }
  const info = { src: `/fotos/${arquivo}`, ...size };
  cache.set(arquivo, info);
  return info;
}
