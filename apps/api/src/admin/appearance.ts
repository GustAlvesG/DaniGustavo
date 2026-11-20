import { resolveTheme, THEMES } from "@casamento/shared";
import { Hono } from "hono";
import { apiError, ERROR_CODES } from "../errors.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { readSetting } from "./event-settings.ts";

/*
 * Aparência do site (Fase 2, frente C): `GET/PUT /api/admin/events/:eventId/appearance`.
 * Grava `event_settings` › `site.theme` (ThemeSelection, público) e revalida a tag `site`.
 */
export function adminAppearanceRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<EventAdminEnv>();

  app.get("/", async (c) => {
    const ev = c.get("event");
    const stored = await readSetting(ev, db, "site.theme");
    return c.json({
      themes: Object.values(THEMES),
      selection: stored ?? null,
      resolved: resolveTheme(ev.type, stored),
    });
  });

  // TODO(fase2-C): validar com ThemeSelection, gravar `site.theme` e revalidar ["site"].
  app.put("/", requirePermission("content.write"), (c) =>
    apiError(c, 501, ERROR_CODES.invalidRequest, "Aparência ainda não disponível."),
  );

  return app;
}
