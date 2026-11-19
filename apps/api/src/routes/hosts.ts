import { and, eq, eventDomains, events, type Database } from "@casamento/db";
import { Hono } from "hono";
import { routeNotFound } from "../errors.ts";
import type { EventResolver } from "../tenancy/resolver.ts";

/**
 * GET /api/hosts/:host — o Next descobre o evento pelo header Host (middleware/proxy).
 * Só eventos `active`; o resto é o mesmo 404 de rota inexistente.
 */
export function hostRoutes(resolver: EventResolver, db: Database) {
  const app = new Hono();
  // Hosts primários dos eventos ativos (o Next usa no generateStaticParams).
  app.get("/", async (c) => {
    const rows = await db
      .select({ host: eventDomains.host })
      .from(eventDomains)
      .innerJoin(events, eq(events.id, eventDomains.eventId))
      .where(and(eq(eventDomains.isPrimary, true), eq(events.status, "active")))
      .orderBy(eventDomains.host);
    c.header("Cache-Control", "public, max-age=60");
    return c.json({ hosts: rows.map((r) => r.host) });
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
