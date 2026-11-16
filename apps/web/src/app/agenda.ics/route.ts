import { cacheLife, cacheTag } from "next/cache";
import { getSite } from "@/lib/api/site";
import { CACHE_TAGS } from "@/lib/api/tags";
import { buildIcs } from "@/lib/calendar";
import { weddingEvent } from "@/lib/site";

/**
 * GET /agenda.ics — "Adicionar à agenda". Route Handler (o "controller" de
 * uma rota sem página). O arquivo inteiro fica em cache junto com
 * /api/site (`"use cache"`), então o DTSTAMP é o momento em que foi gerado.
 */
async function icsBody(): Promise<string> {
  "use cache";
  cacheTag(CACHE_TAGS.site);
  cacheLife({ stale: 300, revalidate: 60, expire: 60 * 60 * 24 * 7 });
  return buildIcs(weddingEvent(await getSite()));
}

export async function GET(): Promise<Response> {
  return new Response(await icsBody(), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="casamento.ics"',
      "cache-control": "public, max-age=300",
    },
  });
}
