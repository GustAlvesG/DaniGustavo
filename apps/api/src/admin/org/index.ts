import { Hono } from "hono";
import { requireOrgAccess, requireOrgEvent, type OrgEventEnv } from "../../tenancy/org-access.ts";
import { resolverFor } from "../../tenancy/resolver.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import type { AdminDeps } from "../context.ts";
import { orgDashboardRoutes, orgEventRoutes } from "./events.ts";
import { orgHostPermissionRoutes } from "./host-permissions.ts";
import { orgEventHostRoutes } from "./hosts.ts";
import { orgTaskTemplateRoutes } from "./task-templates.ts";
import { orgInviteRoutes, orgMemberRoutes } from "./team.ts";
import { orgVendorRoutes } from "./vendors.ts";
import { orgPaymentAccountRoutes } from "./payment-accounts.ts";
import { orgAccountStatusRoutes } from "../payment-account-status.ts";
import { orgSubscriptionRoutes } from "./subscription.ts";
import { orgEventDomainRoutes } from "./domains.ts";
import { orgEventDeletionRoutes } from "./event-deletion.ts";
import { orgVendorCategoryRoutes } from "./vendor-categories.ts";
import { orgPlatformTemplateRoutes } from "./platform-templates.ts";
import { orgSubscriptionGate } from "../../plans/gate.ts";

/**
 * /api/admin/orgs/:orgId/* (Fase 3, docs/saas/fase-3.md), depois de requireSession e do CSRF
 * de adminRoutes. Quem não é da organização recebe o 404 de rota inexistente; cada rota
 * declara a ação com requireOrgPermission (403). Anfitrião de evento não entra aqui.
 */
export function adminOrgRoutes(deps: AdminDeps) {
  const app = new Hono<OrgAdminEnv>();
  app.use("*", requireOrgAccess(deps.db));
  // Fase 6, frente A: inadimplência além da carência → só leitura (exceto /subscription).
  app.use("*", orgSubscriptionGate(deps.db));

  app.get("/", (c) => c.json({ organization: c.get("org"), role: c.get("orgRole") }));

  // A: dashboard e eventos.
  app.route("/dashboard", orgDashboardRoutes(deps));
  app.route("/events", orgEventRoutes(deps));
  // B: equipe e convites.
  app.route("/members", orgMemberRoutes(deps));
  app.route("/invites", orgInviteRoutes(deps));
  // Fase 4 (docs/saas/fase-4.md): A = modelos de tarefas; B = catálogo de fornecedores.
  app.route("/task-templates", orgTaskTemplateRoutes(deps));
  app.route("/vendors", orgVendorRoutes(deps));
  // Fase 5 (docs/saas/fase-5.md): C = subcontas; D = /:accountId/refresh.
  app.route("/payment-accounts", orgPaymentAccountRoutes(deps));
  app.route("/payment-accounts", orgAccountStatusRoutes(deps));
  // Fase 6 (docs/saas/fase-6.md): A = /subscription e /usage; E = categorias e modelos da
  // plataforma.
  app.route("/", orgSubscriptionRoutes(deps));
  app.route("/vendor-categories", orgVendorCategoryRoutes(deps));
  app.route("/platform-task-templates", orgPlatformTemplateRoutes(deps));

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
  // Fase 6: B = domínios do evento; C = apagar evento.
  app.route("/events/:eventId/domains", ofEvent(orgEventDomainRoutes(deps)));
  app.route("/events/:eventId/deletion", ofEvent(orgEventDeletionRoutes(deps)));

  return app;
}
