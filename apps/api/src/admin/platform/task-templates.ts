import { Hono } from "hono";
import { requirePlatformAdmin, requirePlatformPermission } from "../../tenancy/platform-access.ts";
import type { AdminDeps, AdminEnv } from "../context.ts";
import { notYet } from "../stub.ts";

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
  void deps;
  const app = new Hono<AdminEnv>();
  app.use("*", requirePlatformAdmin());
  const soon = "Modelos da plataforma";
  app.get("/", requirePlatformPermission("platform.read"), (c) => notYet(c, soon));
  app.put("/:templateId{[0-9]+}", requirePlatformPermission("platform.templates.manage"), (c) =>
    notYet(c, soon),
  );
  return app;
}
