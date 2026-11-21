import { Hono } from "hono";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 7, frente A (docs/saas/fase-7.md): check-in no painel, em
 * /api/admin/events/:eventId/checkin. Contratos em @casamento/shared › checkin.
 *
 * - GET  /                          → CheckinOverview (totais + links)            (checkin.read)
 * - GET  /invitations?q=|?code=     → CheckinLookupResult (mesma busca da portaria) (checkin.read)
 * - POST /links                     CheckinLinkInput → CheckinLinkCreated (token e PIN aparecem
 *   uma vez; no banco só os hashes)                                               (checkin.manage)
 * - POST /links/:linkId/revoke      → { link }                                    (checkin.manage)
 * - POST /arrivals                  CheckinArrivalInput → CheckinArrivalResult    (checkin.manage)
 * - POST /arrivals/:arrivalId/undo  → CheckinArrivalResult                        (checkin.manage)
 */
export function adminCheckinRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<EventAdminEnv>();
  const soon = "Check-in";
  app.get("/", requirePermission("checkin.read"), (c) => notYet(c, soon));
  app.get("/invitations", requirePermission("checkin.read"), (c) => notYet(c, soon));
  app.post("/links", requirePermission("checkin.manage"), (c) => notYet(c, soon));
  app.post("/links/:linkId{[0-9]+}/revoke", requirePermission("checkin.manage"), (c) =>
    notYet(c, soon),
  );
  app.post("/arrivals", requirePermission("checkin.manage"), (c) => notYet(c, soon));
  app.post("/arrivals/:arrivalId{[0-9]+}/undo", requirePermission("checkin.manage"), (c) =>
    notYet(c, soon),
  );
  return app;
}
