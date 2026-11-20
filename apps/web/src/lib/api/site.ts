import "server-only";

import { notFound } from "next/navigation";
import { SiteContent, type ModuleId } from "@casamento/shared";
import { monogramOf, moduleAvailable } from "@/lib/site";
import { siteFallbackFor } from "@/lib/site-fallback";
import { apiGet } from "./client";
import { currentEvent, type EventInfo } from "./event";
import { CACHE_TAGS } from "./tags";

/**
 * Conteúdo público do evento (`GET /api/e/<slug>/site`): dados, seções, fotos, vocabulário
 * e módulos, cacheado por 60 s com a tag `site:<id>`. Sem evento, usa o da página atual (root
 * param `host`). Se a API não responder (ex.: `next build` no CI), sai o conteúdo de reserva
 * do evento e um aviso no log; o cache se corrige sozinho 15 s depois que a API voltar.
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

/**
 * Conteúdo do evento para uma página de módulo: módulo desligado (ou sem nada a mostrar,
 * como galeria sem fotos) → `notFound()`.
 */
export async function getSiteWithModule(module: ModuleId, event?: EventInfo) {
  const site = await getSite(event);
  if (!moduleAvailable(site, module)) notFound();
  return site;
}

/** Iniciais do monograma do evento da página; null = a arte desenhada (`couple.monogramArt`). */
export async function getMonogram(event?: EventInfo): Promise<string | null> {
  return monogramOf(await getSite(event));
}
