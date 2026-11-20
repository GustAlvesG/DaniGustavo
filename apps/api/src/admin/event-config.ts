import {
  defaultSides,
  EVENT_TYPE_LABELS,
  EventSides,
  eventTypeOf,
  MODULE_LABELS,
  vocabularyFor,
  VocabularyOverrides,
} from "@casamento/shared";
import { Hono } from "hono";
import { apiError, ERROR_CODES } from "../errors.ts";
import { eventModules } from "../tenancy/modules.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { readSetting } from "./event-settings.ts";

/*
 * Configuração do evento (Fase 2, frente D): `GET/PUT /api/admin/events/:eventId/config`.
 * Tipo (`events.type`), módulos (`event.modules`), lados dos convites (`event.sides`, privado)
 * e vocabulário trocado (`event.vocabulary`).
 */
export function adminEventConfigRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<EventAdminEnv>();

  app.get("/", async (c) => {
    const ev = c.get("event");
    const [sides, vocab, modules] = await Promise.all([
      readSetting(ev, db, "event.sides"),
      readSetting(ev, db, "event.vocabulary"),
      eventModules(ev, db),
    ]);
    const overrides = VocabularyOverrides.parse(vocab ?? {});
    return c.json({
      type: eventTypeOf(ev.type),
      types: EVENT_TYPE_LABELS,
      modules,
      moduleLabels: MODULE_LABELS,
      sides: EventSides.safeParse(sides).success ? sides : defaultSides(ev.type),
      vocabularyOverrides: overrides,
      vocabulary: vocabularyFor(ev.type, overrides),
    });
  });

  // TODO(fase2-D): validar (EventType, EventModulesInput, EventSides — sem tirar lado em uso —,
  // VocabularyOverrides), gravar, invalidar o cache do resolver se o tipo mudar e revalidar
  // ["site", "gifts", "messages"].
  app.put("/", requirePermission("event.configure"), (c) =>
    apiError(c, 501, ERROR_CODES.invalidRequest, "Configuração do evento ainda não disponível."),
  );

  return app;
}
