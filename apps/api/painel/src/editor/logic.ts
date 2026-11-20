import {
  MEDIA_MAX_BYTES,
  MEDIA_MAX_DIMENSION,
  MEDIA_MAX_FILES_PER_UPLOAD,
  MEDIA_THUMB_WIDTH,
} from "@casamento/shared";

/*
 * Lógica pura do editor (sem DOM, testada em apps/api/test/painel-editor.test.ts):
 * caminhos em objetos, mover itens, lotes de envio e dimensões da redução no navegador.
 */

/** Lê "a.b.c" de um objeto (undefined se faltar um degrau). */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Cópia do objeto com "a.b.c" trocado (não altera o original). */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split(".");
  const base = (obj ?? {}) as Record<string, unknown>;
  const next = rest.length ? setPath(base[head!], rest.join("."), value) : value;
  return { ...base, [head!]: next } as T;
}

/** Move o item de `from` para `to` (índices fora da lista não mudam nada). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return [...list];
  }
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

/** Divide em lotes de até `size` itens (o envio aceita MEDIA_MAX_FILES_PER_UPLOAD por pedido). */
export function chunk<T>(list: readonly T[], size = MEDIA_MAX_FILES_PER_UPLOAD): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Dimensões depois de caber em `limit` no maior lado (nunca aumenta; arredonda). */
export function fitWithin(
  width: number,
  height: number,
  limit: number,
): { width: number; height: number; scaled: boolean } {
  const biggest = Math.max(width, height);
  if (biggest <= limit) return { width, height, scaled: false };
  const k = limit / biggest;
  return {
    width: Math.max(1, Math.round(width * k)),
    height: Math.max(1, Math.round(height * k)),
    scaled: true,
  };
}

/** A foto original pode ir como está (tipo aceito, tamanho e dimensões dentro dos limites)? */
export function canSendOriginal(file: { type: string; size: number }, w: number, h: number) {
  return (
    ["image/jpeg", "image/png", "image/webp"].includes(file.type) &&
    file.size <= MEDIA_MAX_BYTES &&
    Math.max(w, h) <= MEDIA_MAX_DIMENSION
  );
}

/** Ordem da galeria depois de mover `id` uma posição (-1 sobe, +1 desce) entre as `ids`. */
export function reorderIds(ids: readonly number[], id: number, delta: -1 | 1): number[] {
  const from = ids.indexOf(id);
  return moveItem(ids, from, from + delta);
}

/** Álbuns já usados, sem repetir, em ordem alfabética (sugestões do campo). */
export function albumsOf(media: readonly { album: string | null }[]): string[] {
  return [...new Set(media.map((m) => m.album).filter((a): a is string => !!a))].sort();
}

/** "Pré-wedding 2" → "pre-wedding-2" (o servidor só aceita a-z, 0-9 e -). */
export function albumSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Miniatura com MEDIA_THUMB_WIDTH de largura (não amplia foto menor). */
export function thumbSize(width: number, height: number): { width: number; height: number } {
  if (width <= MEDIA_THUMB_WIDTH) return { width, height };
  return {
    width: MEDIA_THUMB_WIDTH,
    height: Math.max(1, Math.round((height * MEDIA_THUMB_WIDTH) / width)),
  };
}
