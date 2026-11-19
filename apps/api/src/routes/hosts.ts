import { Hono } from "hono";
import { routeNotFound } from "../errors.ts";
import type { EventResolver } from "../tenancy/resolver.ts";

/**
 * GET /api/hosts/:host — o Next descobre o evento pelo header Host (middleware/proxy).
 * Só eventos `active`; o resto é o mesmo 404 de rota inexistente.
 */
export function hostRoutes(resolver: EventResolver) {
  const app = new Hono();
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
      primaryHost,
    });
  });
  return app;
}
