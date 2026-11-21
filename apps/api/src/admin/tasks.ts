import { Hono } from "hono";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 4, frente A (docs/saas/fase-4.md): tarefas do evento, em /api/admin/events/:eventId/tasks.
 *
 * - GET    /                ?view=all|open|overdue|upcoming|done → TaskList
 * - POST   /                TaskInput → { task: TaskRow }
 * - PATCH  /:taskId         TaskUpdate → { task: TaskRow }
 * - DELETE /:taskId         → { ok: true }
 * - GET    /assignees       → { people: PlanningPerson[] } (membros da org + anfitriões)
 * - GET    /templates       → { templates: TaskTemplateSummary[] } (modelos da org do evento)
 * - POST   /apply-template  ApplyTaskTemplate → ApplyTaskTemplateResult
 * - POST   /recalculate     recalcula `due_on` das tarefas com prazo relativo → { updated }
 */
export function adminTaskRoutes(deps: AdminDeps) {
  void deps; // a frente usa db, storage etc.
  const app = new Hono<EventAdminEnv>();
  const soon = "Tarefas";
  app.get("/assignees", requirePermission("tasks.read"), (c) => notYet(c, soon));
  app.get("/templates", requirePermission("tasks.read"), (c) => notYet(c, soon));
  app.post("/apply-template", requirePermission("tasks.write"), (c) => notYet(c, soon));
  app.post("/recalculate", requirePermission("tasks.write"), (c) => notYet(c, soon));
  app.get("/", requirePermission("tasks.read"), (c) => notYet(c, soon));
  app.post("/", requirePermission("tasks.write"), (c) => notYet(c, soon));
  app.patch("/:taskId{[0-9]+}", requirePermission("tasks.write"), (c) => notYet(c, soon));
  app.delete("/:taskId{[0-9]+}", requirePermission("tasks.write"), (c) => notYet(c, soon));
  return app;
}
