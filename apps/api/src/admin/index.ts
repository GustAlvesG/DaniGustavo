import { Hono } from "hono";
import { adminDashboardRoutes, adminMessageRoutes, adminSettingsRoutes } from "./content.ts";
import { requireSession, sameOrigin, type AdminDeps, type AdminEnv } from "./context.ts";
import { adminAppearanceRoutes } from "./appearance.ts";
import { adminEventAccessRoutes } from "./event-access.ts";
import { adminEventConfigRoutes } from "./event-config.ts";
import { adminGiftRoutes, adminUploadRoutes } from "./gifts.ts";
import { adminGuestListRoutes, adminImportRoutes } from "./guest-routes.ts";
import { adminInvitationRoutes } from "./invitations.ts";
import { adminMediaRoutes } from "./media.ts";
import { adminOrderRoutes } from "./orders.ts";
import { adminReminderRoutes } from "./reminders.ts";
import { adminSiteEditorRoutes } from "./site-editor.ts";
import { listAccessibleEvents, requireEventAccess } from "../tenancy/access.ts";
import { listAccessibleOrgs } from "../tenancy/org-access.ts";
import { adminOrgRoutes } from "./org/index.ts";
import { resolverFor } from "../tenancy/resolver.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";

export { uploadFileRoutes } from "./gifts.ts";
export { createWebRevalidator, type CacheTag, type Revalidate } from "./revalidate.ts";
export type { AdminDeps } from "./context.ts";

/**
 * /api/admin/* — rotas do painel. Todas exigem sessão do Better Auth (cookie httpOnly,
 * SameSite=Lax). Tudo do evento fica em /api/admin/events/:eventId/*, atrás de
 * requireEventAccess (quem não tem acesso recebe o mesmo 404 de rota inexistente). CSRF: além do SameSite, escritas com Origin (ou Sec-Fetch-Site) de outra
 * origem são recusadas com 403 — o mesmo critério do `trustedOrigins` do Better Auth.
 */
export function adminRoutes(deps: AdminDeps) {
  const app = new Hono<AdminEnv>();
  const origins = [new URL(deps.env.BETTER_AUTH_URL).origin];
  app.use("*", requireSession(deps.auth));
  app.use("*", sameOrigin(origins));

  // Quem está logado, quais eventos e organizações pode abrir (com o papel em cada um): MeResponse.
  app.get("/me", async (c) => {
    const user = c.get("user");
    const [events, organizations] = await Promise.all([
      listAccessibleEvents(deps.db, user),
      listAccessibleOrgs(deps.db, user),
    ]);
    return c.json({ user, events, organizations });
  });

  const ev = new Hono<EventAdminEnv>();
  ev.use("*", requireEventAccess(deps.db, resolverFor(deps.db, deps.eventResolver)));
  ev.route("/dashboard", adminDashboardRoutes(deps));
  ev.route("/invitations/import", adminImportRoutes(deps));
  ev.route("/invitations/lists", adminGuestListRoutes(deps));
  ev.route("/invitations", adminInvitationRoutes(deps));
  ev.route("/gifts", adminGiftRoutes(deps));
  ev.route("/uploads", adminUploadRoutes(deps));
  ev.route("/orders", adminOrderRoutes(deps));
  ev.route("/messages", adminMessageRoutes(deps));
  ev.route("/settings", adminSettingsRoutes(deps));
  ev.route("/reminders", adminReminderRoutes(deps));
  // Fase 2 (docs/saas/fase-2.md): A = /site e /media; C = /appearance; D = /config.
  ev.route("/site", adminSiteEditorRoutes(deps));
  ev.route("/media", adminMediaRoutes(deps));
  ev.route("/appearance", adminAppearanceRoutes(deps));
  ev.route("/config", adminEventConfigRoutes(deps));
  // Fase 3 (docs/saas/fase-3.md), frente C: o que quem está logado pode fazer no evento.
  ev.route("/access", adminEventAccessRoutes(deps));
  app.route("/events/:eventId", ev);

  // Fase 3 (docs/saas/fase-3.md): painel da organização.
  app.route("/orgs/:orgId", adminOrgRoutes(deps));
  return app;
}
