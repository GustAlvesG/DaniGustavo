/**
 * Tags de cache das leituras da API, sempre por evento (`site:12`), para que mudar o
 * conteúdo de um evento não descarte o cache dos outros. Uma escrita invalida a tag com
 * `updateTag`/`revalidateTag` (next/cache), como um `Cache::tags(...)->flush()` do Laravel.
 */
export const CACHE_TAGS = {
  /** Host → evento (`/api/hosts/:host`). */
  host: (host: string) => `host:${host}`,
  site: (eventId: number) => `site:${eventId}`,
  gifts: (eventId: number) => `gifts:${eventId}`,
  messages: (eventId: number) => `messages:${eventId}`,
} as const;

/** Tags que a API pode pedir para revalidar em POST /api/revalidar (por evento). */
export const EVENT_TAG_KINDS = ["site", "gifts", "messages"] as const;
export type EventTagKind = (typeof EVENT_TAG_KINDS)[number];

/** Intervalo padrão de revalidação das leituras públicas, em segundos. */
export const DEFAULT_REVALIDATE = 60;
