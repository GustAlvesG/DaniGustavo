import "server-only";

import { SiteContent } from "@casamento/shared";
import { contentFor, siteFallbackFor, type EventContent } from "@/lib/legacy-content";
import { apiGet } from "./client";
import { currentEvent, type EventInfo } from "./event";
import { CACHE_TAGS } from "./tags";

/**
 * Conteúdo público do evento (`GET /api/e/<slug>/site`), cacheado por 60 s com a tag
 * `site:<id>`. Sem evento, usa o da página atual (root param `host`). Se a API não
 * responder (ex.: `next build` no CI), sai o conteúdo de reserva do evento e um aviso no
 * log; o cache se corrige sozinho 15 s depois que a API voltar.
 */
export async function getSite(event?: EventInfo): Promise<SiteContent> {
  const ev = event ?? (await currentEvent());
  if (ev.id === 0) return siteFallbackFor(ev);
  const result = await apiGet(`/api/e/${encodeURIComponent(ev.slug)}/site`, SiteContent, {
    tags: [CACHE_TAGS.site(ev.id)],
  });
  if (result.ok) return result.data;
  console.warn(
    `[site] /api/e/${ev.slug}/site indisponível (${result.status} ${result.error.code}): usando conteúdo de reserva. ${result.error.message}`,
  );
  return siteFallbackFor(ev);
}

/** Textos e fotos de apresentação do evento da página atual (veja lib/legacy-content). */
export async function getContent(event?: EventInfo): Promise<EventContent> {
  return contentFor(event ?? (await currentEvent()));
}
