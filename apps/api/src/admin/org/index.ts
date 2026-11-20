import { Hono } from "hono";
import { requireOrgAccess, requireOrgEvent, type OrgEventEnv } from "../../tenancy/org-access.ts";
import { resolverFor } from "../../tenancy/resolver.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import type { AdminDeps } from "../context.ts";
import { orgDashboardRoutes, orgEventRoutes } from "./events.ts";
import { orgHostPermissionRoutes } from "./host-permissions.ts";
import { orgEventHostRoutes } from "./hosts.ts";
import { orgInviteRoutes, orgMemberRoutes } from "./team.ts";

/**
 * /api/admin/orgs/:orgId/* (Fase 3, docs/saas/fase-3.md), depois de requireSession e do CSRF
 * de adminRoutes. Quem não é da organização recebe o 404 de rota inexistente; cada rota
 * declara a ação com requireOrgPermission (403). Anfitrião de evento não entra aqui.
 */
export function adminOrgRoutes(deps: AdminDeps) {
  const app = new Hono<OrgAdminEnv>();
  app.use("*", requireOrgAccess(deps.db));

  app.get("/", (c) => c.json({ organization: c.get("org"), role: c.get("orgRole") }));

  // A: dashboard e eventos.
  app.route("/dashboard", orgDashboardRoutes(deps));
  app.route("/events", orgEventRoutes(deps));
  // B: equipe e convites.
  app.route("/members", orgMemberRoutes(deps));
  app.route("/invites", orgInviteRoutes(deps));

  // Rotas de um evento da organização. O middleware fica dentro de cada grupo (e não em
  // "/events/:eventId/*") para não pegar /events/slug-check da frente A.
  const resolver = resolverFor(deps.db, deps.eventResolver);
  const ofEvent = (routes: Hono<OrgEventEnv>) => {
    const scoped = new Hono<OrgEventEnv>();
    scoped.use("*", requireOrgEvent(deps.db, resolver));
    scoped.route("/", routes);
    return scoped;
  };
  app.route("/events/:eventId/hosts", ofEvent(orgEventHostRoutes(deps))); // B
  app.route("/events/:eventId/host-permissions", ofEvent(orgHostPermissionRoutes(deps))); // C

  return app;
}
