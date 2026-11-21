import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/*
 * Arquivos enviados pelo painel (fotos dos presentes e do evento), sempre por evento:
 * `<eventId>/<arquivo>`, servidos em `/uploads/<eventId>/<arquivo>`. Hoje só disco local
 * (UPLOAD_DIR); S3 e afins entram como outra implementação quando o usuário aprovar a
 * dependência (docs/saas/AGENTES.md).
 */

/** Nome de arquivo aceito: ULID + sufixo opcional da miniatura (`-t`) + extensão de imagem. */
export const STORAGE_FILE = /^[0-9A-Z]{26}(-t)?\.(jpg|png|webp)$/;

export const STORAGE_MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

/**
 * Fase 4: arquivo da área privada (contratos): ULID + extensão. Fica em
 * `<eventId>/private/<arquivo>` e nunca é servido por /uploads (o `get` público não aceita "/").
 */
export const PRIVATE_FILE = /^[0-9A-Z]{26}\.(pdf|jpg|png|webp)$/;

export interface Storage {
  /** Grava (sobrescreve) o arquivo do evento. */
  put(eventId: number, file: string, bytes: Uint8Array): Promise<void>;
  /** Conteúdo do arquivo, ou null se não existir. */
  get(eventId: number, file: string): Promise<Uint8Array | null>;
  /** Apaga; arquivo inexistente não é erro. */
  delete(eventId: number, file: string): Promise<void>;
  /** URL pública (o Next repassa `/uploads/*` à API). */
  url(eventId: number, file: string): string;
  /** Fase 4: área privada do evento (contratos), lida só por rota autenticada do painel. */
  putPrivate(eventId: number, file: string, bytes: Uint8Array): Promise<void>;
  getPrivate(eventId: number, file: string): Promise<Uint8Array | null>;
  deletePrivate(eventId: number, file: string): Promise<void>;
  /** Fase 6 (apagar evento, LGPD): remove a pasta inteira do evento, inclusive a privada. */
  deleteEvent(eventId: number): Promise<void>;
  /** Fase 6 (limite de espaço do plano): bytes em disco do evento, inclusive a área privada. */
  usageBytes(eventId: number): Promise<number>;
}

function assertSafe(eventId: number, file: string, pattern = STORAGE_FILE) {
  if (!Number.isSafeInteger(eventId) || eventId <= 0 || !pattern.test(file)) {
    throw new Error(`Arquivo inválido no Storage: ${eventId}/${file}`);
  }
}

/** Disco local: `<dir>/<eventId>/<arquivo>`; escrita atômica (arquivo temporário + rename). */
export function createLocalStorage(dir: string): Storage {
  const path = (eventId: number, file: string) => join(dir, String(eventId), file);
  const privatePath = (eventId: number, file: string) =>
    join(dir, String(eventId), "private", file);
  const write = async (target: string, bytes: Uint8Array) => {
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, target);
  };
  return {
    async put(eventId, file, bytes) {
      assertSafe(eventId, file);
      await write(path(eventId, file), bytes);
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
    async putPrivate(eventId, file, bytes) {
      assertSafe(eventId, file, PRIVATE_FILE);
      await write(privatePath(eventId, file), bytes);
    },
    async getPrivate(eventId, file) {
      if (!Number.isSafeInteger(eventId) || eventId <= 0 || !PRIVATE_FILE.test(file)) return null;
      try {
        return new Uint8Array(await readFile(privatePath(eventId, file)));
      } catch {
        return null;
      }
    },
    async deletePrivate(eventId, file) {
      assertSafe(eventId, file, PRIVATE_FILE);
      await unlink(privatePath(eventId, file)).catch(() => undefined);
    },
    async deleteEvent(eventId) {
      if (!Number.isSafeInteger(eventId) || eventId <= 0) {
        throw new Error(`Evento inválido no Storage: ${eventId}`);
      }
      await rm(join(dir, String(eventId)), { recursive: true, force: true });
    },
    async usageBytes(eventId) {
      if (!Number.isSafeInteger(eventId) || eventId <= 0) return 0;
      const sum = async (folder: string): Promise<number> => {
        const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
        let total = 0;
        for (const entry of entries) {
          const full = join(folder, entry.name);
          if (entry.isDirectory()) total += await sum(full);
          else if (entry.isFile()) total += (await stat(full)).size;
        }
        return total;
      };
      return sum(join(dir, String(eventId)));
    },
  };
}
