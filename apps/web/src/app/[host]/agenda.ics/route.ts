import { cacheLife, cacheTag } from "next/cache";
import { getEvent, type EventInfo } from "@/lib/api/event";
import { getSite } from "@/lib/api/site";
import { CACHE_TAGS } from "@/lib/api/tags";
import { buildIcs } from "@/lib/calendar";
import { decodeHostParam } from "@/lib/host";
import { hostUrl, weddingEvent } from "@/lib/site";

/**
 * GET /agenda.ics — "Adicionar à agenda", com o nome e a data do evento do host. Route
 * Handler (o "controller" de uma rota sem página). O arquivo inteiro fica em cache junto com
 * o /site do evento (`"use cache"`, tag `site:<id>`), então o DTSTAMP é o momento em que foi
 * gerado.
 */
async function icsBody(ev: EventInfo): Promise<string> {
  "use cache";
  cacheTag(CACHE_TAGS.site(ev.id));
  cacheLife({ stale: 300, revalidate: 60, expire: 60 * 60 * 24 * 7 });
  const site = await getSite(ev);
  return buildIcs(
    weddingEvent(site, { slug: ev.slug, type: ev.type, baseUrl: hostUrl(ev.primaryHost) }),
  );
}

export async function GET(_req: Request, ctx: RouteContext<"/[host]/agenda.ics">) {
  const ev = await getEvent(decodeHostParam((await ctx.params).host));
  return new Response(await icsBody(ev), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${ev.type === "wedding" ? "casamento" : "evento"}.ics"`,
      "cache-control": "public, max-age=300",
    },
  });
}
