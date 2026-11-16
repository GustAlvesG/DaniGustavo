/**
 * Tags de cache das leituras da API (PROMPT §3). Uma escrita que muda um
 * conteúdo invalida a tag com `updateTag`/`revalidateTag` (next/cache).
 */
export const CACHE_TAGS = {
  site: "site",
  gifts: "gifts",
  messages: "messages",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

/** Intervalo padrão de revalidação das leituras públicas, em segundos. */
export const DEFAULT_REVALIDATE = 60;
