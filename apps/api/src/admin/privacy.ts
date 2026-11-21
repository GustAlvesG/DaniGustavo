import { Hono } from "hono";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 6, frente C (docs/saas/fase-6.md): LGPD do evento, em /api/admin/events/:eventId/privacy.
 *
 * - GET   /                  → { settings: PrivacySettings, openRequests: number }  (privacy.read)
 * - PUT   /settings          PrivacySettings → { settings }                      (privacy.manage)
 * - GET   /requests          ?status= → { requests: PrivacyRequestView[] }        (privacy.read)
 * - PATCH /requests/:id      PrivacyRequestUpdate → { request }                  (privacy.manage)
 * - POST  /anonymize         AnonymizeInput → { invitations, orders }            (privacy.manage)
 * - GET   /export            → JSON com convites, convidados, respostas, pedidos e recados do
 *   evento (attachment; sem segredos, sem ids internos de provedor)        (privacy.manage)
 */
export function adminPrivacyRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<EventAdminEnv>();
  const soon = "Privacidade";
  app.get("/", requirePermission("privacy.read"), (c) => notYet(c, soon));
  app.put("/settings", requirePermission("privacy.manage"), (c) => notYet(c, soon));
  app.get("/requests", requirePermission("privacy.read"), (c) => notYet(c, soon));
  app.patch("/requests/:requestId{[0-9]+}", requirePermission("privacy.manage"), (c) =>
    notYet(c, soon),
  );
  app.post("/anonymize", requirePermission("privacy.manage"), (c) => notYet(c, soon));
  app.get("/export", requirePermission("privacy.manage"), (c) => notYet(c, soon));
  return app;
}
