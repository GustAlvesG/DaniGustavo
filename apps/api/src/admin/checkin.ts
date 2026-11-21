import {
  CheckinArrivalInput,
  CheckinLinkInput,
  type CheckinArrivalResult,
  type CheckinOverview,
} from "@casamento/shared";
import { Hono } from "hono";
import { lookupResponse } from "../checkin/http.ts";
import { createLink, revokeLink } from "../checkin/links.ts";
import { listLinks, markArrival, recentArrivals, totals, undoArrival } from "../checkin/service.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import { invalid, notFound, readJson, sensitiveLimit, type AdminDeps } from "./context.ts";

/*
 * Fase 7, frente A (docs/saas/fase-7.md): check-in no painel, em
 * /api/admin/events/:eventId/checkin. Contratos em @casamento/shared › checkin.
 *
 * - GET  /                          → CheckinOverview (totais + links + marcações recentes)
 *                                                                                 (checkin.read)
 * - GET  /invitations?q=|?code=     → CheckinLookupResult (mesma busca da portaria) (checkin.read)
 * - POST /links                     CheckinLinkInput → CheckinLinkCreated (token e PIN aparecem
 *   uma vez; no banco só os hashes)                                               (checkin.manage)
 * - POST /links/:linkId/revoke      → { link }                                    (checkin.manage)
 * - POST /arrivals                  CheckinArrivalInput → CheckinArrivalResult    (checkin.manage)
 * - POST /arrivals/:arrivalId/undo  → CheckinArrivalResult                        (checkin.manage)
 */
export function adminCheckinRoutes(deps: AdminDeps) {
  const { db, env, now } = deps;
  const secret = env.BETTER_AUTH_SECRET;
  const app = new Hono<EventAdminEnv>();

  app.get("/", requirePermission("checkin.read"), async (c) => {
    const ev = c.get("event");
    const body: CheckinOverview = {
      totals: await totals(ev, db),
      links: await listLinks(ev, db, now()),
      recent: await recentArrivals(ev, db, secret),
    };
    return c.json(body);
  });

  app.get("/invitations", requirePermission("checkin.read"), (c) =>
    lookupResponse(c, c.get("event"), db, secret),
  );

  app.post(
    "/links",
    requirePermission("checkin.manage"),
    sensitiveLimit(deps.limiter, "checkin-link"),
    async (c) => {
      const parsed = CheckinLinkInput.safeParse((await readJson(c)) ?? {});
      if (!parsed.success) return invalid(c, parsed.error.issues);
      const created = await createLink(
        c.get("event"),
        db,
        parsed.data,
        c.get("user").id,
        env.BETTER_AUTH_URL,
        now(),
      );
      c.header("Cache-Control", "no-store");
      return c.json(created, 201);
    },
  );

  app.post("/links/:linkId{[0-9]+}/revoke", requirePermission("checkin.manage"), async (c) => {
    const link = await revokeLink(c.get("event"), db, Number(c.req.param("linkId")), now());
    if (!link) return notFound(c, "Link da portaria");
    return c.json({ link });
  });

  app.post("/arrivals", requirePermission("checkin.manage"), async (c) => {
    const ev = c.get("event");
    const parsed = CheckinArrivalInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const invitation = await markArrival(
      ev,
      db,
      secret,
      parsed.data,
      { userId: c.get("user").id },
      now(),
    );
    if (!invitation) return notFound(c, "Convite");
    const body: CheckinArrivalResult = { invitation, totals: await totals(ev, db) };
    return c.json(body, 201);
  });

  app.post("/arrivals/:arrivalId{[0-9]+}/undo", requirePermission("checkin.manage"), async (c) => {
    const ev = c.get("event");
    const invitation = await undoArrival(ev, db, secret, Number(c.req.param("arrivalId")), now());
    if (!invitation) return notFound(c, "Chegada");
    const body: CheckinArrivalResult = { invitation, totals: await totals(ev, db) };
    return c.json(body);
  });

  return app;
}
