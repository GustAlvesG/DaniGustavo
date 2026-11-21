import { Hono } from "hono";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 6, frente E: lembrete semanal de tarefas, em /api/admin/events/:eventId/tasks/reminders.
 *
 * - GET /  → TaskRemindersView                               (tasks.read)
 * - PUT /  TaskRemindersUpdate → TaskRemindersView           (tasks.read; `settings` exige
 *   tasks.write → 403; `mine` é a preferência de quem está logado, em task_reminder_prefs)
 */
export function adminTaskReminderRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<EventAdminEnv>();
  const soon = "Lembrete de tarefas";
  app.get("/reminders", requirePermission("tasks.read"), (c) => notYet(c, soon));
  app.put("/reminders", requirePermission("tasks.read"), (c) => notYet(c, soon));
  return app;
}
