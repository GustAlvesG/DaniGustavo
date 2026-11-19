import { LEGACY_EVENT_ID } from "@casamento/db";
import type { MiddlewareHandler } from "hono";
import { routeNotFound } from "../errors.ts";
import type { EventResolver } from "./resolver.ts";
import type { EventCtx, PublicEventEnv } from "./types.ts";

/**
 * O evento 1 (o casamento que já existia). Usado pelas rotas públicas antigas sem slug e pelos
 * jobs enquanto eles não iteram os eventos (etapa 6).
 * TODO(fase1-etapa7): as rotas públicas antigas saem.
 */
export async function legacyEvent(resolver: EventResolver): Promise<EventCtx> {
  const ev = await resolver.byId(LEGACY_EVENT_ID);
  if (!ev) throw new Error(`Evento ${LEGACY_EVENT_ID} não existe. Rode db:migrate e db:seed.`);
  return ev;
}

/**
 * Apelido: `/api/site`, `/api/gifts`... respondem como `/api/e/<slug do evento 1>/...`.
 * Sem conferir o status, como antes da plataforma (o site do casamento nunca dependeu dele).
 * TODO(fase1-etapa7): sai quando o Next passar a chamar /api/e/:slug.
 */
export function legacyPublicEvent(resolver: EventResolver): MiddlewareHandler<PublicEventEnv> {
  return async (c, next) => {
    // `/x` e `/x/*` podem casar juntos: resolve uma vez só.
    if (!c.get("event")) {
      const ev = await resolver.byId(LEGACY_EVENT_ID);
      if (!ev) return routeNotFound(c);
      c.set("event", ev);
    }
    await next();
  };
}
