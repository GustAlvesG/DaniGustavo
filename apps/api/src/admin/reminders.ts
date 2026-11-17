import { ReminderSettings } from "@casamento/shared";
import { Hono } from "hono";
import { reminderStatus, saveReminderSettings, sendRemindersNow } from "../reminders.ts";
import { invalid, readJson, sensitiveLimit } from "./context.ts";
import type { AdminDeps, AdminEnv } from "./context.ts";

/** /api/admin/reminders: configuração, contagem e envio manual dos lembretes de RSVP. */
export function adminReminderRoutes(deps: AdminDeps) {
  const { db, env, mailer, now, limiter } = deps;
  const rd = { env, db, mailer, now };
  const app = new Hono<AdminEnv>();

  app.get("/", async (c) => c.json(await reminderStatus(rd)));

  app.put("/", async (c) => {
    const body = ReminderSettings.safeParse(await readJson(c));
    if (!body.success) return invalid(c, body.error.issues);
    await saveReminderSettings(db, body.data);
    return c.json(await reminderStatus(rd));
  });

  // O painel mostra a contagem (GET) e só então chama este envio.
  app.post("/send", sensitiveLimit(limiter, "reminders"), async (c) => {
    const result = await sendRemindersNow(rd);
    return c.json({ ...result, status: await reminderStatus(rd) });
  });

  return app;
}
