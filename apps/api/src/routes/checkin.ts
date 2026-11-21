import {
  CheckinArrivalInput,
  CheckinSessionInput,
  type CheckinArrivalResult,
} from "@casamento/shared";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { invalid, readJson, type AdminDeps } from "../admin/context.ts";
import { lookupResponse } from "../checkin/http.ts";
import { checkSession, openSession } from "../checkin/links.ts";
import { markArrival, totals, undoArrival } from "../checkin/service.ts";
import { apiError, ERROR_CODES } from "../errors.ts";
import { resolverFor } from "../tenancy/resolver.ts";
import type { EventCtx } from "../tenancy/types.ts";

/*
 * Fase 7, frente A (docs/saas/fase-7.md): API da portaria, sem conta, em /api/checkin.
 * Isenta de X-Web-Key (web-key.ts): quem chama é o navegador da portaria, sem cookie; a
 * credencial vai em `Authorization: Bearer <sessão>`, então não há CSRF a temer.
 *
 * - POST /session            CheckinSessionInput → CheckinSessionResult. Link achado pelo
 *   SHA-256 do token dentro de `crossEvent`; PIN conferido por scrypt em tempo constante; rate
 *   limit por IP e por link; CHECKIN_PIN_MAX_FAILURES erros bloqueiam o link por
 *   CHECKIN_PIN_LOCK_MINUTES. Mesma resposta 401 para token inválido, expirado, revogado e PIN
 *   errado. Sessão = HMAC (evento, link, expiração) com BETTER_AUTH_SECRET; cada requisição
 *   confere no banco que o link segue ativo (revogar derruba na hora).
 * - GET  /summary            → CheckinTotals (polling)
 * - GET  /lookup?code=|?q=   → CheckinLookupResult (sem contato nem dado de saúde)
 * - POST /arrivals           CheckinArrivalInput → CheckinArrivalResult
 * - POST /arrivals/:arrivalId/undo → CheckinArrivalResult (só marcações deste evento)
 */

const MINUTE = 60_000;
/** Tentativas de PIN por IP a cada 10 minutos (além do bloqueio por link). */
export const CHECKIN_SESSION_IP_LIMIT = 10;
/** Chamadas da portaria por link por minuto (polling + leituras; vários aparelhos no mesmo link). */
export const CHECKIN_LINK_RATE_LIMIT = 300;

export const CHECKIN_DENIED = "Link ou PIN inválido. Confira com a organização do evento.";
const SESSION_LOST = "A sessão da portaria acabou. Entre de novo com o PIN.";

/** IP do visitante: o edge (Caddy) sobrescreve X-Real-IP/X-Forwarded-For com o IP real. */
function visitorIp(c: Context): string {
  const real = c.req.header("x-real-ip")?.trim();
  if (real) return real.slice(0, 45);
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.slice(0, 45);
  try {
    return getConnInfo(c).remote.address ?? "desconhecido";
  } catch {
    return "desconhecido";
  }
}

type PortariaEnv = { Variables: { event: EventCtx; linkId: number } };

const tooMany = (c: Context, retryAfter: number) =>
  apiError(
    c,
    429,
    ERROR_CODES.tooManyRequests,
    `Muitas tentativas seguidas. Aguarde ${retryAfter} segundos e tente de novo.`,
    { "Retry-After": String(retryAfter) },
  );

export function checkinRoutes(deps: AdminDeps) {
  const { db, env, limiter, now } = deps;
  const secret = env.BETTER_AUTH_SECRET;
  const resolver = resolverFor(db, deps.eventResolver);
  const app = new Hono<PortariaEnv>();

  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    await next();
  });

  app.post("/session", async (c) => {
    const r = limiter.hit(`checkin:pin:${visitorIp(c)}`, CHECKIN_SESSION_IP_LIMIT, 10 * MINUTE);
    if (!r.allowed) return tooMany(c, r.retryAfter);
    const parsed = CheckinSessionInput.safeParse((await readJson(c)) ?? {});
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const opened = await openSession(db, secret, parsed.data.token, parsed.data.pin, now());
    const ev = opened ? await resolver.byId(opened.eventId) : null;
    if (!opened || !ev) return apiError(c, 401, ERROR_CODES.unauthorized, CHECKIN_DENIED);
    return c.json({
      session: opened.session,
      expiresAt: opened.expiresAt.toISOString(),
      event: { name: ev.name, startsAt: ev.startsAt?.toISOString() ?? null, timezone: ev.timezone },
      linkLabel: opened.linkLabel,
    });
  });

  // Daqui para baixo: sessão da portaria (Bearer). O cookie do painel não vale aqui.
  const session: MiddlewareHandler<PortariaEnv> = async (c, next) => {
    const bearer = /^Bearer\s+(.+)$/i.exec(c.req.header("authorization") ?? "")?.[1] ?? "";
    const found = bearer ? await checkSession(db, secret, bearer, now()) : null;
    const ev = found ? await resolver.byId(found.eventId) : null;
    if (!found || !ev) return apiError(c, 401, ERROR_CODES.unauthorized, SESSION_LOST);
    const r = limiter.hit(`checkin:link:${found.linkId}`, CHECKIN_LINK_RATE_LIMIT, MINUTE);
    if (!r.allowed) return tooMany(c, r.retryAfter);
    c.set("event", ev);
    c.set("linkId", found.linkId);
    await next();
  };

  app.get("/summary", session, async (c) => c.json(await totals(c.get("event"), db)));

  app.get("/lookup", session, (c) => lookupResponse(c, c.get("event"), db, secret));

  app.post("/arrivals", session, async (c) => {
    const ev = c.get("event");
    const parsed = CheckinArrivalInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const invitation = await markArrival(
      ev,
      db,
      secret,
      parsed.data,
      { linkId: c.get("linkId") },
      now(),
    );
    if (!invitation) return apiError(c, 404, ERROR_CODES.notFound, "Convite não encontrado.");
    const body: CheckinArrivalResult = { invitation, totals: await totals(ev, db) };
    return c.json(body, 201);
  });

  app.post("/arrivals/:arrivalId{[0-9]+}/undo", session, async (c) => {
    const ev = c.get("event");
    const invitation = await undoArrival(ev, db, secret, Number(c.req.param("arrivalId")), now());
    if (!invitation) return apiError(c, 404, ERROR_CODES.notFound, "Chegada não encontrada.");
    const body: CheckinArrivalResult = { invitation, totals: await totals(ev, db) };
    return c.json(body);
  });

  return app;
}
