import { ReminderSettings } from "@casamento/shared";
import { Hono } from "hono";
import { reminderStatus, saveReminderSettings, sendRemindersNow } from "../reminders.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import { invalid, readJson, sensitiveLimit } from "./context.ts";
import type { AdminDeps } from "./context.ts";

/** /api/admin/reminders: configuração, contagem e envio manual dos lembretes de RSVP. */
export function adminReminderRoutes(deps: AdminDeps) {
  const { db, env, mailer, now, limiter } = deps;
  const app = new Hono<EventAdminEnv>();
  const rd = (ev: EventAdminEnv["Variables"]["event"]) => ({ ev, env, db, mailer, now });

  app.get("/", requirePermission("reminders.read"), async (c) =>
    c.json(await reminderStatus(rd(c.get("event")))),
  );

  app.put("/", requirePermission("reminders.write"), async (c) => {
    const ev = c.get("event");
    const body = ReminderSettings.safeParse(await readJson(c));
    if (!body.success) return invalid(c, body.error.issues);
    await saveReminderSettings(ev, db, body.data);
    return c.json(await reminderStatus(rd(ev)));
  });

  // O painel mostra a contagem (GET) e só então chama este envio.
  app.post(
    "/send",
    requirePermission("reminders.write"),
    sensitiveLimit(limiter, "reminders"),
    async (c) => {
      const deps = rd(c.get("event"));
      const result = await sendRemindersNow(deps);
      return c.json({ ...result, status: await reminderStatus(deps) });
    },
  );

  return app;
}
