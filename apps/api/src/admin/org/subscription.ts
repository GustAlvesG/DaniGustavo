import { Hono } from "hono";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import type { AdminDeps } from "../context.ts";
import { notYet } from "../stub.ts";

/*
 * Fase 6, frente A (docs/saas/fase-6.md): assinatura e uso da organização, em
 * /api/admin/orgs/:orgId.
 *
 * - GET  /subscription         → SubscriptionView                         (org.read)
 * - POST /subscription         SubscriptionChangeInput → SubscriptionChangeResult (billing.manage;
 *   plano interno/inexistente → 422; limite do plano novo menor que o uso atual → 409 plan_limit)
 * - POST /subscription/cancel  → SubscriptionView (billing.manage; vale até o fim do período)
 * - GET  /usage                → UsageView                                (org.read)
 * Estas rotas passam pelo orgSubscriptionGate mesmo inadimplente (é por onde se paga).
 */
export function orgSubscriptionRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<OrgAdminEnv>();
  const soon = "Assinatura";
  app.get("/subscription", requireOrgPermission("org.read"), (c) => notYet(c, soon));
  app.post("/subscription", requireOrgPermission("billing.manage"), (c) => notYet(c, soon));
  app.post("/subscription/cancel", requireOrgPermission("billing.manage"), (c) => notYet(c, soon));
  app.get("/usage", requireOrgPermission("org.read"), (c) => notYet(c, soon));
  return app;
}
