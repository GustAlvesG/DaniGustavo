import type { MiddlewareHandler } from "hono";
import { routeNotFound } from "../errors.ts";
import type { EventResolver } from "./resolver.ts";
import type { PublicEventEnv } from "./types.ts";

/**
 * `/api/e/:slug/*`: põe o evento no contexto (`c.get("event")`). Slug inexistente ou evento
 * que não está `active` (rascunho, arquivado) → o mesmo 404 de rota inexistente.
 */
export function publicEvent(resolver: EventResolver): MiddlewareHandler<PublicEventEnv> {
  return async (c, next) => {
    const slug = c.req.param("slug");
    const event = slug ? await resolver.bySlug(slug) : null;
    if (!event || event.status !== "active") return routeNotFound(c);
    c.set("event", event);
    await next();
  };
}
