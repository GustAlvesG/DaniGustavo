import { and, byEvent, eq, taskReminderPrefs } from "@casamento/db";
import { TaskRemindersUpdate, type TaskRemindersView } from "@casamento/shared";
import { Hono } from "hono";
import { apiError, ERROR_CODES } from "../errors.ts";
import { readTaskReminderSettings, TASK_REMINDERS_KEY } from "../tasks/reminder-job.ts";
import { can, requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv, EventCtx } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { invalid, readJson } from "./context.ts";
import { writeSetting } from "./event-settings.ts";

/*
 * Fase 6, frente E: lembrete semanal de tarefas, em /api/admin/events/:eventId/tasks/reminders.
 *
 * - GET /  → TaskRemindersView                               (tasks.read)
 * - PUT /  TaskRemindersUpdate → TaskRemindersView           (tasks.read; `settings` exige
 *   tasks.write → 403; `mine` é a preferência de quem está logado, em task_reminder_prefs)
 */
export function adminTaskReminderRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<EventAdminEnv>();

  const view = async (ev: EventCtx, userId: string): Promise<TaskRemindersView> => {
    const [pref] = await db
      .select()
      .from(taskReminderPrefs)
      .where(and(byEvent(taskReminderPrefs, ev), eq(taskReminderPrefs.userId, userId)));
    return {
      settings: await readTaskReminderSettings(ev, db),
      mine: {
        enabled: pref?.enabled ?? true,
        lastSentAt: pref?.lastSentAt ? pref.lastSentAt.toISOString() : null,
      },
    };
  };

  app.get("/reminders", requirePermission("tasks.read"), async (c) =>
    c.json(await view(c.get("event"), c.get("user").id)),
  );

  app.put("/reminders", requirePermission("tasks.read"), async (c) => {
    const ev = c.get("event");
    const userId = c.get("user").id;
    const parsed = TaskRemindersUpdate.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const { settings, mine } = parsed.data;
    if (settings && !can(c.get("eventRole"), "tasks.write", c.get("hostDeny"))) {
      return apiError(
        c,
        403,
        ERROR_CODES.unauthorized,
        "Você não tem permissão para fazer isso neste evento.",
      );
    }
    if (settings) await writeSetting(ev, db, TASK_REMINDERS_KEY, settings, false);
    if (mine) {
      const now = new Date();
      await db
        .insert(taskReminderPrefs)
        .values({ eventId: ev.id, userId, enabled: mine.enabled })
        .onDuplicateKeyUpdate({ set: { enabled: mine.enabled, updatedAt: now } });
    }
    return c.json(await view(ev, userId));
  });

  return app;
}
