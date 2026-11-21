import { getConnInfo } from "@hono/node-server/conninfo";
import { and, byEvent, eq, vendorPortalLinks, type Database } from "@casamento/db";
import type { Context, MiddlewareHandler } from "hono";
import { apiError, ERROR_CODES } from "../errors.ts";
import { clientIp } from "../log.ts";
import type { RateLimiter } from "../rate-limit.ts";
import { crossEvent } from "../tenancy/cross-event.ts";
import type { EventResolver } from "../tenancy/resolver.ts";
import type { EventCtx } from "../tenancy/types.ts";
import { findEventVendor, hashPortalToken, isPortalTokenShape } from "./links.ts";

/*
 * Fase 7, frente C: credencial do portal do fornecedor. O navegador manda o token do link em
 * `Authorization: Bearer …` (sem cookie, então sem CSRF). O link é achado pelo SHA-256 dentro de
 * `crossEvent` (ainda não se sabe o evento); daí em diante tudo filtra pelo evento e pelo
 * fornecedor do link. Inexistente, expirado, revogado ou de evento arquivado: o mesmo 401.
 */

export interface PortalCtx {
  ev: EventCtx;
  linkId: number;
  eventVendorId: number;
  vendorName: string;
  category: string;
  expiresAt: Date;
}

export type PortalEnv = { Variables: { portal: PortalCtx } };

const MINUTE = 60_000;
/** Pedidos por IP por minuto (o portal faz poucas chamadas por tela). */
export const VENDOR_PORTAL_REQUEST_LIMIT = 120;
/** Tokens recusados por IP a cada 10 minutos antes do 429. */
export const VENDOR_PORTAL_FAILURE_LIMIT = 20;
/** Último uso gravado no máximo uma vez por minuto (o portal faz várias chamadas por tela). */
const TOUCH_EVERY_MS = MINUTE;

export const PORTAL_DENIED = "Este link não vale mais. Peça um novo à organização do evento.";

export function visitorIp(c: Context): string {
  const ip = clientIp(c.req.raw.headers);
  if (ip) return ip.slice(0, 45);
  try {
    return getConnInfo(c).remote.address ?? "desconhecido";
  } catch {
    return "desconhecido";
  }
}

const tooMany = (c: Context, retryAfter: number) =>
  apiError(
    c,
    429,
    ERROR_CODES.tooManyRequests,
    `Muitas tentativas seguidas. Aguarde ${retryAfter} segundos e tente de novo.`,
    { "Retry-After": String(retryAfter) },
  );

export interface PortalAuthDeps {
  db: Database;
  limiter: RateLimiter;
  resolver: EventResolver;
  now: () => Date;
}

export function requirePortalLink(deps: PortalAuthDeps): MiddlewareHandler<PortalEnv> {
  const { db, limiter, resolver } = deps;
  return async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    const ip = visitorIp(c);
    const r = limiter.hit(`vendor-portal:req:${ip}`, VENDOR_PORTAL_REQUEST_LIMIT, MINUTE);
    if (!r.allowed) return tooMany(c, r.retryAfter);

    const deny = () => {
      const f = limiter.hit(`vendor-portal:fail:${ip}`, VENDOR_PORTAL_FAILURE_LIMIT, 10 * MINUTE);
      if (!f.allowed) return tooMany(c, f.retryAfter);
      return apiError(c, 401, ERROR_CODES.unauthorized, PORTAL_DENIED);
    };

    const token = /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") ?? "")?.[1] ?? "";
    if (!isPortalTokenShape(token)) return deny();
    const hash = hashPortalToken(token);
    const [link] = await crossEvent(
      "portal do fornecedor: link pelo token",
      async () =>
        // `await` aqui dentro: a consulta do Drizzle só roda ao ser aguardada (e o auditor olha o
        // contexto de quem executa).
        await db.select().from(vendorPortalLinks).where(eq(vendorPortalLinks.tokenHash, hash)),
    );
    const now = deps.now();
    if (!link || link.revokedAt || link.expiresAt <= now) return deny();
    const ev = await resolver.byId(link.eventId);
    if (!ev || ev.status === "archived") return deny();
    const vendor = await findEventVendor(db, ev, link.eventVendorId);
    if (!vendor) return deny();

    if (!link.lastUsedAt || now.getTime() - link.lastUsedAt.getTime() >= TOUCH_EVERY_MS) {
      await db
        .update(vendorPortalLinks)
        .set({ lastUsedAt: now })
        .where(and(byEvent(vendorPortalLinks, ev), eq(vendorPortalLinks.id, link.id)));
    }
    c.set("portal", {
      ev,
      linkId: link.id,
      eventVendorId: vendor.id,
      vendorName: vendor.name,
      category: vendor.category,
      expiresAt: link.expiresAt,
    });
    await next();
  };
}
