import { Hono } from "hono";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import type { AdminDeps } from "../context.ts";
import { notYet } from "../stub.ts";

/*
 * Fase 6, frente E: modelos de tarefas prontos da PLATAFORMA vistos pela organização, em
 * /api/admin/orgs/:orgId/platform-task-templates (leitura global de `platform_task_templates`,
 * tabela sem organização: exceção do auditor).
 *
 * - GET  /             ?eventType= → { templates: PlatformTaskTemplateView[] } (org.read)
 * - POST /:id/copy     → { template: TaskTemplateView } cópia no catálogo da organização
 *   (templates.manage)
 * Aplicar direto num evento: POST /api/admin/events/:eventId/tasks/apply-platform-template
 * (`{ templateId }`, tasks.write), na frente E em admin/tasks.ts.
 */
export function orgPlatformTemplateRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<OrgAdminEnv>();
  const soon = "Modelos da plataforma";
  app.get("/", requireOrgPermission("org.read"), (c) => notYet(c, soon));
  app.post("/:templateId{[0-9]+}/copy", requireOrgPermission("templates.manage"), (c) =>
    notYet(c, soon),
  );
  return app;
}
