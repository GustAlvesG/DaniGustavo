import { EVENT_TYPES, TaskTemplateInput } from "@casamento/shared";
import { Hono } from "hono";
import { ERROR_CODES, errorBody } from "../../errors.ts";
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  replaceTemplate,
} from "../../tasks/templates.ts";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import { invalid, notFound, readJson, type AdminDeps } from "../context.ts";

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
  const { db } = deps;
  const app = new Hono<OrgAdminEnv>();
  const one = "/:templateId{[0-9]+}";

  const parseInput = async (c: Parameters<typeof invalid>[0]) => {
    const parsed = TaskTemplateInput.safeParse(await readJson(c));
    if (!parsed.success) return { error: invalid(c, parsed.error.issues) };
    const { eventType } = parsed.data;
    if (eventType !== null && !(EVENT_TYPES as readonly string[]).includes(eventType)) {
      return {
        error: c.json(
          errorBody(ERROR_CODES.invalidRequest, "Tipo de evento inválido.", "eventType"),
          422,
        ),
      };
    }
    return { data: parsed.data };
  };

  app.get("/", requireOrgPermission("org.read"), async (c) => {
    const eventType = c.req.query("eventType");
    return c.json({ templates: await listTemplates(db, c.get("org").id, eventType || undefined) });
  });

  app.post("/", requireOrgPermission("templates.manage"), async (c) => {
    const input = await parseInput(c);
    if (input.error) return input.error;
    const orgId = c.get("org").id;
    const id = await createTemplate(db, orgId, input.data);
    return c.json({ template: await getTemplate(db, orgId, id) }, 201);
  });

  app.get(one, requireOrgPermission("org.read"), async (c) => {
    const template = await getTemplate(db, c.get("org").id, Number(c.req.param("templateId")));
    if (!template) return notFound(c, "Modelo");
    return c.json({ template });
  });

  app.put(one, requireOrgPermission("templates.manage"), async (c) => {
    const input = await parseInput(c);
    if (input.error) return input.error;
    const orgId = c.get("org").id;
    const id = Number(c.req.param("templateId"));
    if (!(await replaceTemplate(db, orgId, id, input.data))) return notFound(c, "Modelo");
    return c.json({ template: await getTemplate(db, orgId, id) });
  });

  app.delete(one, requireOrgPermission("templates.manage"), async (c) => {
    if (!(await deleteTemplate(db, c.get("org").id, Number(c.req.param("templateId"))))) {
      return notFound(c, "Modelo");
    }
    return c.json({ ok: true });
  });

  return app;
}
