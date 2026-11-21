import { Hono } from "hono";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import type { AdminDeps } from "../context.ts";
import { notYet } from "../stub.ts";

/*
 * Fase 4, frente A (docs/saas/fase-4.md): modelos de tarefas da organização, em
 * /api/admin/orgs/:orgId/task-templates.
 *
 * - GET    /             ?eventType= → { templates: TaskTemplateSummary[] }
 * - POST   /             TaskTemplateInput → { template: TaskTemplateView }
 * - GET    /:templateId  → { template: TaskTemplateView }
 * - PUT    /:templateId  TaskTemplateInput (troca os itens) → { template }
 * - DELETE /:templateId  → { ok } (as tarefas já geradas ficam)
 */
export function orgTaskTemplateRoutes(deps: AdminDeps) {
  void deps; // a frente usa db, storage etc.
  const app = new Hono<OrgAdminEnv>();
  const soon = "Modelos de tarefas";
  const one = "/:templateId{[0-9]+}";
  app.get("/", requireOrgPermission("org.read"), (c) => notYet(c, soon));
  app.post("/", requireOrgPermission("templates.manage"), (c) => notYet(c, soon));
  app.get(one, requireOrgPermission("org.read"), (c) => notYet(c, soon));
  app.put(one, requireOrgPermission("templates.manage"), (c) => notYet(c, soon));
  app.delete(one, requireOrgPermission("templates.manage"), (c) => notYet(c, soon));
  return app;
}
