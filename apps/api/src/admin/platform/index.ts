import { Hono } from "hono";
import { requirePlatformAdmin, requirePlatformPermission } from "../../tenancy/platform-access.ts";
import type { AdminDeps, AdminEnv } from "../context.ts";
import { notYet } from "../stub.ts";

/*
 * Fase 6, frente A (docs/saas/fase-6.md): painel do platform admin, em /api/admin/platform.
 * Quem não é platform admin recebe o 404 de rota. Leituras entre organizações dentro de
 * crossEvent("painel da plataforma", fn).
 *
 * - GET   /overview          → PlatformOverview                   (platform.read)
 * - GET   /orgs              ?q=&status= → { organizations: PlatformOrgRow[] } (platform.read)
 * - GET   /orgs/:orgId       → { organization: PlatformOrgRow, subscription: SubscriptionView }
 * - PATCH /orgs/:orgId       PlatformOrgUpdate → idem              (platform.orgs.manage; plano
 *   interno só aqui; suspender a org não tira o site dos convidados do ar)
 * - GET   /plans             → { plans: PlanView[] } (todos, inclusive internos e inativos)
 * - POST  /plans             PlanInput → { plan }                  (platform.plans.manage)
 * - PATCH /plans/:code       PlanUpdate → { plan }                 (platform.plans.manage)
 * Os modelos de tarefas da plataforma (frente E) ficam em ./task-templates.ts.
 */
export function platformRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<AdminEnv>();
  app.use("*", requirePlatformAdmin());
  const soon = "Painel da plataforma";
  const org = "/orgs/:orgId{[0-9]+}";
  app.get("/overview", requirePlatformPermission("platform.read"), (c) => notYet(c, soon));
  app.get("/orgs", requirePlatformPermission("platform.read"), (c) => notYet(c, soon));
  app.get(org, requirePlatformPermission("platform.read"), (c) => notYet(c, soon));
  app.patch(org, requirePlatformPermission("platform.orgs.manage"), (c) => notYet(c, soon));
  app.get("/plans", requirePlatformPermission("platform.read"), (c) => notYet(c, soon));
  app.post("/plans", requirePlatformPermission("platform.plans.manage"), (c) => notYet(c, soon));
  app.patch("/plans/:code", requirePlatformPermission("platform.plans.manage"), (c) =>
    notYet(c, soon),
  );
  return app;
}
