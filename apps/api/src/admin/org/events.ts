import { Hono } from "hono";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import type { AdminDeps } from "../context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 3, frente A (docs/saas/fase-3.md): eventos e dashboard da organização.
 *
 * - GET   /api/admin/orgs/:orgId/dashboard              → OrgDashboard
 * - GET   /api/admin/orgs/:orgId/events                 → { events: OrgEventSummary[] }
 * - GET   /api/admin/orgs/:orgId/events/slug-check?slug= → SlugCheck
 * - POST  /api/admin/orgs/:orgId/events                 → CreateOrgEventInput → createEventRecord
 * - PATCH /api/admin/orgs/:orgId/events/:eventId        → { status } (rascunho/ativo/arquivado)
 *
 * Nada de middleware com "*" aqui: `/events/:eventId/{hosts,host-permissions}` são de outras
 * frentes e passam pelo mesmo prefixo.
 */

export function orgDashboardRoutes(deps: AdminDeps) {
  void deps; // a frente usa deps (db, mailer, limiter...)
  const app = new Hono<OrgAdminEnv>();
  // TODO(fase3-A): eventos da org com convidados, confirmados e presentes recebidos (centavos).
  app.get("/", requireOrgPermission("org.read"), (c) => notYet(c, "Dashboard da organização"));
  return app;
}

export function orgEventRoutes(deps: AdminDeps) {
  void deps; // a frente usa deps (db, mailer, limiter...)
  const app = new Hono<OrgAdminEnv>();
  // TODO(fase3-A): lista, conferência de endereço, criação e mudança de status.
  app.get("/", requireOrgPermission("org.read"), (c) => notYet(c, "Lista de eventos"));
  app.get("/slug-check", requireOrgPermission("events.create"), (c) =>
    notYet(c, "Conferência de endereço"),
  );
  app.post("/", requireOrgPermission("events.create"), (c) => notYet(c, "Criar evento"));
  app.patch("/:eventId", requireOrgPermission("events.create"), (c) =>
    notYet(c, "Mudar status do evento"),
  );
  return app;
}
