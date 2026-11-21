import { and, eq, eventDomains, events, isNotNull, type Database } from "@casamento/db";
import { Hono } from "hono";
import type { Env } from "../env.ts";
import { routeNotFound } from "../errors.ts";
import type { EventResolver } from "../tenancy/resolver.ts";

/** Host como chega ao `ask` (minúsculo, sem ponto final); lixo vira null. */
const ASK_HOST = /^[a-z0-9.-]+(:\d{1,5})?$/;
function askHost(raw: string | undefined): string | null {
  const host = (raw ?? "").trim().toLowerCase().replace(/\.$/, "");
  return host && host.length <= 191 && ASK_HOST.test(host) && !host.includes("..") ? host : null;
}

/**
 * GET /api/hosts/:host — o Next descobre o evento pelo header Host (middleware/proxy).
 * Só eventos `active`; o resto é o mesmo 404 de rota inexistente.
 *
 * Fase 6, frente B: GET /api/hosts/ask?domain=<host> é o `ask` do on-demand TLS do Caddy (o
 * Caddy acrescenta `?domain=`). Sem autenticação (GET é isento de X-Web-Key) e barato (resolver
 * com cache): 200 só para o `PLATFORM_HOST` e para host que resolve um evento ativo, isto é,
 * domínio verificado em `event_domains` (inclui os subdomínios `<slug>.<PLATFORM_BASE_DOMAIN>`,
 * que nascem verificados); o resto 404, e o Caddy não emite certificado.
 */
export function hostRoutes(
  resolver: EventResolver,
  db: Database,
  env: Pick<Env, "PLATFORM_HOST"> = {},
) {
  const app = new Hono();
  // Hosts primários dos eventos ativos (o Next usa no generateStaticParams).
  app.get("/", async (c) => {
    const rows = await db
      .select({ host: eventDomains.host })
      .from(eventDomains)
      .innerJoin(events, eq(events.id, eventDomains.eventId))
      .where(
        and(
          eq(eventDomains.isPrimary, true),
          eq(events.status, "active"),
          isNotNull(eventDomains.verifiedAt),
        ),
      )
      .orderBy(eventDomains.host);
    c.header("Cache-Control", "public, max-age=60");
    return c.json({ hosts: rows.map((r) => r.host) });
  });
  app.get("/ask", async (c) => {
    c.header("Cache-Control", "no-store");
    const host = askHost(c.req.query("domain"));
    if (!host) return c.json({ ok: false }, 404);
    const platform = env.PLATFORM_HOST?.toLowerCase();
    // O Caddy pergunta sem a porta; em desenvolvimento o PLATFORM_HOST pode ter uma.
    if (platform && (host === platform || host === platform.replace(/:\d+$/, ""))) {
      return c.json({ ok: true });
    }
    const event = await resolver.byHost(host);
    if (!event || event.status !== "active") return c.json({ ok: false }, 404);
    return c.json({ ok: true });
  });
  app.get("/:host", async (c) => {
    const host = c.req.param("host").trim().toLowerCase();
    const event = await resolver.byHost(host);
    if (!event || event.status !== "active") return routeNotFound(c);
    const primaryHost = (await resolver.primaryHost(event.id)) ?? host;
    c.header("Cache-Control", "public, max-age=60");
    return c.json({
      id: event.id,
      slug: event.slug,
      name: event.name,
      type: event.type,
      timezone: event.timezone,
      startsAt: event.startsAt ? event.startsAt.toISOString() : null,
      primaryHost,
    });
  });
  return app;
}
