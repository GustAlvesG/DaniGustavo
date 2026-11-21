import {
  ApplyTaskTemplate,
  TaskInput,
  TaskUpdate,
  TaskView,
  type ApplyTaskTemplateResult,
} from "@casamento/shared";
import { Hono } from "hono";
import { ERROR_CODES, errorBody } from "../errors.ts";
import {
  applyTemplate,
  createTask,
  deleteTask,
  listAssignees,
  listTasks,
  recalculateTaskDues,
  TaskRuleError,
  updateTask,
} from "../tasks/service.ts";
import { applyPlatformTemplate, listPlatformTemplates } from "../tasks/platform-templates.ts";
import { listTemplates } from "../tasks/templates.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import { invalid, notFound, readJson, type AdminDeps } from "./context.ts";

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
  const { db, now } = deps;
  const app = new Hono<EventAdminEnv>();

  app.get("/assignees", requirePermission("tasks.read"), async (c) =>
    c.json({ people: await listAssignees(db, c.get("event")) }),
  );

  app.get("/templates", requirePermission("tasks.read"), async (c) => {
    const ev = c.get("event");
    return c.json({ templates: await listTemplates(db, ev.orgId, ev.type) });
  });

  app.post("/apply-template", requirePermission("tasks.write"), async (c) => {
    const parsed = ApplyTaskTemplate.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const created = await applyTemplate(db, c.get("event"), parsed.data.templateId);
    if (created === null) return notFound(c, "Modelo");
    return c.json({ created } satisfies ApplyTaskTemplateResult);
  });

  app.get("/platform-templates", requirePermission("tasks.read"), async (c) =>
    c.json({ templates: await listPlatformTemplates(db, c.get("event").type) }),
  );

  app.post("/apply-platform-template", requirePermission("tasks.write"), async (c) => {
    const parsed = ApplyTaskTemplate.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const created = await applyPlatformTemplate(db, c.get("event"), parsed.data.templateId);
    if (created === null) return notFound(c, "Modelo");
    return c.json({ created } satisfies ApplyTaskTemplateResult);
  });

  app.post("/recalculate", requirePermission("tasks.write"), async (c) =>
    c.json({ updated: await recalculateTaskDues(db, c.get("event")) }),
  );

  app.get("/", requirePermission("tasks.read"), async (c) => {
    const view = TaskView.safeParse(c.req.query("view") ?? "all");
    if (!view.success) return invalid(c, [{ message: "Visão inválida." }]);
    return c.json(await listTasks(db, c.get("event"), view.data, now()));
  });

  const ruleError = (c: Parameters<typeof invalid>[0], err: unknown) => {
    if (err instanceof TaskRuleError) {
      return c.json(errorBody(ERROR_CODES.invalidRequest, err.message, err.field), 422);
    }
    throw err;
  };

  app.post("/", requirePermission("tasks.write"), async (c) => {
    const parsed = TaskInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    try {
      const task = await createTask(db, c.get("event"), parsed.data, c.get("user"), now());
      return c.json({ task }, 201);
    } catch (err) {
      return ruleError(c, err);
    }
  });

  app.patch("/:taskId{[0-9]+}", requirePermission("tasks.write"), async (c) => {
    const parsed = TaskUpdate.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    try {
      const task = await updateTask(
        db,
        c.get("event"),
        Number(c.req.param("taskId")),
        parsed.data,
        c.get("user"),
        now(),
      );
      if (!task) return notFound(c, "Tarefa");
      return c.json({ task });
    } catch (err) {
      return ruleError(c, err);
    }
  });

  app.delete("/:taskId{[0-9]+}", requirePermission("tasks.write"), async (c) => {
    const ok = await deleteTask(db, c.get("event"), Number(c.req.param("taskId")));
    if (!ok) return notFound(c, "Tarefa");
    return c.json({ ok: true });
  });

  return app;
}
