import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

/*
 * Arquivos enviados pelo painel (fotos dos presentes e do evento), sempre por evento:
 * `<eventId>/<arquivo>`, servidos em `/uploads/<eventId>/<arquivo>`. Hoje só disco local
 * (UPLOAD_DIR); S3 e afins entram como outra implementação quando o usuário aprovar a
 * dependência (docs/saas/AGENTES.md).
 */

/** Nome de arquivo aceito: ULID + sufixo opcional da miniatura (`-t`) + extensão de imagem. */
export const STORAGE_FILE = /^[0-9A-Z]{26}(-t)?\.(jpg|png|webp)$/;

export const STORAGE_MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

export interface Storage {
  /** Grava (sobrescreve) o arquivo do evento. */
  put(eventId: number, file: string, bytes: Uint8Array): Promise<void>;
  /** Conteúdo do arquivo, ou null se não existir. */
  get(eventId: number, file: string): Promise<Uint8Array | null>;
  /** Apaga; arquivo inexistente não é erro. */
  delete(eventId: number, file: string): Promise<void>;
  /** URL pública (o Next repassa `/uploads/*` à API). */
  url(eventId: number, file: string): string;
}

function assertSafe(eventId: number, file: string) {
  if (!Number.isSafeInteger(eventId) || eventId <= 0 || !STORAGE_FILE.test(file)) {
    throw new Error(`Arquivo inválido no Storage: ${eventId}/${file}`);
  }
}

/** Disco local: `<dir>/<eventId>/<arquivo>`; escrita atômica (arquivo temporário + rename). */
export function createLocalStorage(dir: string): Storage {
  const path = (eventId: number, file: string) => join(dir, String(eventId), file);
  return {
    async put(eventId, file, bytes) {
      assertSafe(eventId, file);
      await mkdir(join(dir, String(eventId)), { recursive: true });
      const tmp = `${path(eventId, file)}.${process.pid}.tmp`;
      await writeFile(tmp, bytes);
      await rename(tmp, path(eventId, file));
    },
    async get(eventId, file) {
      if (!STORAGE_FILE.test(file)) return null;
      try {
        return new Uint8Array(await readFile(path(eventId, file)));
      } catch {
        return null;
      }
    },
    async delete(eventId, file) {
      assertSafe(eventId, file);
      await unlink(path(eventId, file)).catch(() => undefined);
    },
    url: (eventId, file) => `/uploads/${eventId}/${file}`,
  };
}
