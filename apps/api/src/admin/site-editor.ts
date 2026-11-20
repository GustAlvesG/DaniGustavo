import { and, byEvent, eventMedia, inArray } from "@casamento/db";
import {
  defaultSections,
  mediaIdsIn,
  SiteSections,
  vocabularyFor,
  VocabularyOverrides,
} from "@casamento/shared";
import { Hono } from "hono";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { invalid, readJson } from "./context.ts";
import { readSetting, writeSetting } from "./event-settings.ts";

/*
 * Editor das seções do site (Fase 2, frente A): `GET/PUT /api/admin/events/:eventId/site`.
 * Grava `event_settings` › `site.sections` (público) e revalida a tag `site`.
 */
export function adminSiteEditorRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<EventAdminEnv>();

  // Conteúdo gravado, ou o neutro do tipo (o editor abre preenchido).
  app.get("/", requirePermission("content.read"), async (c) => {
    const ev = c.get("event");
    const stored = await readSetting(ev, db, "site.sections");
    const vocabulary = vocabularyFor(
      ev.type,
      VocabularyOverrides.parse((await readSetting(ev, db, "event.vocabulary")) ?? {}),
    );
    return c.json({
      sections:
        stored === undefined ? defaultSections(ev.type, vocabulary) : SiteSections.parse(stored),
      isDefault: stored === undefined,
    });
  });

  // Corpo: { sections }. Cada mediaId tem de ser foto do próprio evento.
  app.put("/", requirePermission("content.write"), async (c) => {
    const ev = c.get("event");
    const body = await readJson(c);
    const raw = body && typeof body === "object" ? (body as { sections?: unknown }).sections : null;
    const parsed = SiteSections.safeParse(raw);
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const ids = mediaIdsIn(parsed.data);
    if (ids.length) {
      const found = await db
        .select({ id: eventMedia.id })
        .from(eventMedia)
        .where(and(byEvent(eventMedia, ev), inArray(eventMedia.id, ids)));
      if (found.length !== ids.length) {
        return invalid(c, [{ message: "Uma das fotos não existe neste evento. Escolha de novo." }]);
      }
    }
    await writeSetting(ev, db, "site.sections", parsed.data, true);
    await deps.revalidate(ev.id, ["site"]);
    return c.json({ sections: parsed.data, isDefault: false });
  });

  return app;
}
