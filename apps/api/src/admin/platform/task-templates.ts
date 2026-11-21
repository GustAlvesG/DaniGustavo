import { PlatformTaskTemplateInput } from "@casamento/shared";
import { Hono } from "hono";
import {
  getPlatformTemplate,
  listAllPlatformTemplates,
  replacePlatformTemplate,
} from "../../tasks/platform-templates.ts";
import { requirePlatformAdmin, requirePlatformPermission } from "../../tenancy/platform-access.ts";
import { invalid, notFound, readJson, type AdminDeps, type AdminEnv } from "../context.ts";

/*
 * Fase 6, frente E: modelos de tarefas da plataforma, em /api/admin/platform/task-templates
 * (só platform admin; os demais, 404 de rota). O seed/setup faz upsert dos modelos de
 * packages/db/src/platform-task-templates.ts por `code`.
 *
 * - GET    /       → { templates: PlatformTaskTemplateView[] }           (platform.read)
 * - PUT    /:id    { name, eventType, description, active, items } → { template }
 *   (platform.templates.manage; troca os itens)
 */
export function platformTaskTemplateRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<AdminEnv>();
  app.use("*", requirePlatformAdmin());
  app.get("/", requirePlatformPermission("platform.read"), async (c) =>
    c.json({ templates: await listAllPlatformTemplates(db) }),
  );
  app.put(
    "/:templateId{[0-9]+}",
    requirePlatformPermission("platform.templates.manage"),
    async (c) => {
      const parsed = PlatformTaskTemplateInput.safeParse(await readJson(c));
      if (!parsed.success) return invalid(c, parsed.error.issues);
      const id = Number(c.req.param("templateId"));
      if (!(await replacePlatformTemplate(db, id, parsed.data))) return notFound(c, "Modelo");
      return c.json({ template: await getPlatformTemplate(db, id, false) });
    },
  );
  return app;
}
