import { Hono } from "hono";
import { copyPlatformTemplate, listPlatformTemplates } from "../../tasks/platform-templates.ts";
import { getTemplate } from "../../tasks/templates.ts";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import { notFound, type AdminDeps } from "../context.ts";

/*
 * Fase 6, frente E: modelos de tarefas prontos da PLATAFORMA vistos pela organização, em
 * /api/admin/orgs/:orgId/platform-task-templates (leitura global de `platform_task_templates`,
 * tabela sem organização: exceção do auditor).
 *
 * - GET  /             ?eventType= → { templates: PlatformTaskTemplateView[] } (org.read; só ativos)
 * - POST /:id/copy     → { template: TaskTemplateView } cópia no catálogo da organização
 *   (templates.manage)
 * Aplicar direto num evento: POST /api/admin/events/:eventId/tasks/apply-platform-template
 * (`{ templateId }`, tasks.write), em admin/tasks.ts.
 */
export function orgPlatformTemplateRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<OrgAdminEnv>();
  app.get("/", requireOrgPermission("org.read"), async (c) => {
    const eventType = c.req.query("eventType");
    return c.json({ templates: await listPlatformTemplates(db, eventType || undefined) });
  });
  app.post("/:templateId{[0-9]+}/copy", requireOrgPermission("templates.manage"), async (c) => {
    const orgId = c.get("org").id;
    const id = await copyPlatformTemplate(db, orgId, Number(c.req.param("templateId")));
    if (id === null) return notFound(c, "Modelo");
    return c.json({ template: await getTemplate(db, orgId, id) }, 201);
  });
  return app;
}
