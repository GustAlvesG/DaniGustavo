import { paletteContrastIssues, resolveTheme, THEMES, ThemeSelection } from "@casamento/shared";
import { Hono } from "hono";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import { invalid, readJson, type AdminDeps } from "./context.ts";
import { readSetting, writeSetting } from "./event-settings.ts";

/*
 * Aparência do site (Fase 2, frente C): `GET/PUT /api/admin/events/:eventId/appearance`.
 * Grava `event_settings` › `site.theme` (ThemeSelection, público) e revalida a tag `site`.
 * O anfitrião escolhe entre temas, paletas e fontes prontos (sem cor livre): o contraste foi
 * validado no registro; aqui só se confere que a escolha existe no tema.
 */
export function adminAppearanceRoutes(deps: AdminDeps) {
  const { db, revalidate } = deps;
  const app = new Hono<EventAdminEnv>();

  app.get("/", requirePermission("content.read"), async (c) => {
    const ev = c.get("event");
    const stored = await readSetting(ev, db, "site.theme");
    return c.json({
      themes: Object.values(THEMES),
      selection: stored ?? null,
      resolved: resolveTheme(ev.type, stored),
    });
  });

  app.put("/", requirePermission("content.write"), async (c) => {
    const ev = c.get("event");
    const body = ThemeSelection.safeParse(await readJson(c));
    if (!body.success) return invalid(c, body.error.issues);
    const resolved = resolveTheme(ev.type, body.data);
    if (paletteContrastIssues(resolved.colors).length) {
      return invalid(c, [{ message: "A paleta escolhida não passa no contraste mínimo." }]);
    }
    await writeSetting(ev, db, "site.theme", body.data, true);
    await revalidate(ev.id, ["site"]);
    return c.json({ ok: true, selection: body.data, resolved });
  });

  return app;
}
