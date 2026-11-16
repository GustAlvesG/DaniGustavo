import "server-only";

import { SiteContent } from "@casamento/shared";
import { SITE_FALLBACK } from "@/content/site-fallback";
import { apiGet } from "./client";
import { CACHE_TAGS } from "./tags";

/**
 * Conteúdo público do site (`GET /api/site`), cacheado por 60 s com a tag
 * "site". Se a API não responder (ex.: `next build` no CI, onde ela não
 * roda), o site sai com o conteúdo de reserva e um aviso no log, e se corrige
 * sozinho 15 s depois que a API voltar — o build nunca falha por isso.
 */
export async function getSite(): Promise<SiteContent> {
  const result = await apiGet("/api/site", SiteContent, { tags: [CACHE_TAGS.site] });
  if (result.ok) return result.data;
  console.warn(
    `[site] /api/site indisponível (${result.status} ${result.error.code}): usando conteúdo de reserva. ${result.error.message}`,
  );
  return SITE_FALLBACK;
}
