import { Hono } from "hono";
import { requireOrgPermission, type OrgEventEnv } from "../../tenancy/org-access.ts";
import type { AdminDeps } from "../context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 3, frente B (docs/saas/fase-3.md): anfitriões de um evento da organização. Montado em
 * /api/admin/orgs/:orgId/events/:eventId/hosts atrás de requireOrgEvent (`event` no contexto).
 *
 * - GET    /         → { hosts: EventHostRow[], invites: TeamInvite[] }
 * - POST   /         → HostInviteInput (convite por e-mail; conta existente também recebe convite)
 * - DELETE /:userId  → remove o vínculo em event_members (a conta continua existindo)
 */
export function orgEventHostRoutes(deps: AdminDeps) {
  void deps; // a frente usa deps (db, mailer, limiter...)
  const app = new Hono<OrgEventEnv>();
  // TODO(fase3-B)
  app.get("/", requireOrgPermission("org.read"), (c) => notYet(c, "Anfitriões"));
  app.post("/", requireOrgPermission("hosts.manage"), (c) => notYet(c, "Convidar anfitrião"));
  app.delete("/:userId", requireOrgPermission("hosts.manage"), (c) =>
    notYet(c, "Remover anfitrião"),
  );
  return app;
}
