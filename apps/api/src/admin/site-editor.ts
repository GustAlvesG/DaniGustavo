import {
  defaultSections,
  SiteSections,
  vocabularyFor,
  VocabularyOverrides,
} from "@casamento/shared";
import { Hono } from "hono";
import { apiError, ERROR_CODES } from "../errors.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { readSetting } from "./event-settings.ts";

/*
 * Editor das seções do site (Fase 2, frente A): `GET/PUT /api/admin/events/:eventId/site`.
 * Grava `event_settings` › `site.sections` (público) e revalida a tag `site`.
 */
export function adminSiteEditorRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<EventAdminEnv>();

  // Conteúdo gravado, ou o neutro do tipo (o editor abre preenchido).
  app.get("/", async (c) => {
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

  // TODO(fase2-A): validar com SiteSections, conferir que cada mediaId é do evento, gravar e
  // revalidar ["site"].
  app.put("/", requirePermission("content.write"), (c) =>
    apiError(c, 501, ERROR_CODES.invalidRequest, "Editor do site ainda não disponível."),
  );

  return app;
}
