import { Hono } from "hono";
import { adminDashboardRoutes, adminMessageRoutes, adminSettingsRoutes } from "./content.ts";
import { requireSession, sameOrigin, type AdminDeps, type AdminEnv } from "./context.ts";
import { adminGiftRoutes, adminUploadRoutes } from "./gifts.ts";
import { adminGuestListRoutes, adminImportRoutes } from "./guest-routes.ts";
import { adminInvitationRoutes } from "./invitations.ts";
import { adminOrderRoutes } from "./orders.ts";
import { adminReminderRoutes } from "./reminders.ts";
import { listAccessibleEvents } from "../tenancy/access.ts";

export { uploadFileRoutes } from "./gifts.ts";
export { createWebRevalidator, type CacheTag, type Revalidate } from "./revalidate.ts";
export type { AdminDeps } from "./context.ts";

/**
 * /api/admin/* — rotas do painel. Todas exigem sessão do Better Auth (cookie httpOnly,
 * SameSite=Lax). CSRF: além do SameSite, escritas com Origin (ou Sec-Fetch-Site) de outra
 * origem são recusadas com 403 — o mesmo critério do `trustedOrigins` do Better Auth.
 */
export function adminRoutes(deps: AdminDeps) {
  const app = new Hono<AdminEnv>();
  const origins = [new URL(deps.env.BETTER_AUTH_URL).origin];
  app.use("*", requireSession(deps.auth));
  app.use("*", sameOrigin(origins));

  // Quem está logado e quais eventos pode abrir (com o papel em cada um).
  app.get("/me", async (c) => {
    const user = c.get("user");
    const events = await listAccessibleEvents(deps.db, user);
    return c.json({ user, events });
  });

  app.route("/dashboard", adminDashboardRoutes(deps));
  app.route("/invitations/import", adminImportRoutes(deps));
  app.route("/invitations/lists", adminGuestListRoutes(deps));
  app.route("/invitations", adminInvitationRoutes(deps));
  app.route("/gifts", adminGiftRoutes(deps));
  app.route("/uploads", adminUploadRoutes(deps));
  app.route("/orders", adminOrderRoutes(deps));
  app.route("/messages", adminMessageRoutes(deps));
  app.route("/settings", adminSettingsRoutes(deps));
  app.route("/reminders", adminReminderRoutes(deps));
  return app;
}
