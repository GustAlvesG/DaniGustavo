import {
  AdminEventConfigInput,
  defaultSides,
  EVENT_TYPE_LABELS,
  EventSides,
  eventTypeOf,
  MODULE_LABELS,
  sideLabel,
  vocabularyFor,
  VocabularyOverrides,
} from "@casamento/shared";
import { byEvent, count, eq, events, invitations, type Database } from "@casamento/db";
import { Hono } from "hono";
import { resolverFor } from "../tenancy/resolver.ts";
import { eventModules } from "../tenancy/modules.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv, EventCtx } from "../tenancy/types.ts";
import { invalid, readJson, type AdminDeps } from "./context.ts";
import { readSetting, writeSetting } from "./event-settings.ts";

/** Lados do evento: `event.sides` gravado ou o padrão do tipo. */
export async function eventSides(ev: EventCtx, db: Database): Promise<EventSides> {
  const raw = await readSetting(ev, db, "event.sides");
  const parsed = EventSides.safeParse(raw);
  return parsed.success ? parsed.data : defaultSides(ev.type);
}

/*
 * Configuração do evento (Fase 2, frente D): `GET/PUT /api/admin/events/:eventId/config`.
 * Tipo (`events.type`), módulos (`event.modules`), lados dos convites (`event.sides`, privado)
 * e vocabulário trocado (`event.vocabulary`).
 */
export function adminEventConfigRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<EventAdminEnv>();

  async function configDto(ev: EventCtx) {
    const [vocab, modules, sides] = await Promise.all([
      readSetting(ev, db, "event.vocabulary"),
      eventModules(ev, db),
      eventSides(ev, db),
    ]);
    const overrides = VocabularyOverrides.parse(vocab ?? {});
    return {
      type: eventTypeOf(ev.type),
      types: EVENT_TYPE_LABELS,
      modules,
      moduleLabels: MODULE_LABELS,
      sides,
      vocabularyOverrides: overrides,
      vocabulary: vocabularyFor(ev.type, overrides),
    };
  }

  app.get("/", async (c) => c.json(await configDto(c.get("event"))));

  app.put("/", requirePermission("event.configure"), async (c) => {
    const ev = c.get("event");
    const parsed = AdminEventConfigInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const input = parsed.data;

    // Lado em uso não sai: o convite ficaria com um lado que o evento não tem mais.
    const keys = new Set(input.sides.map((s) => s.key));
    const used = await db
      .select({ side: invitations.side, total: count() })
      .from(invitations)
      .where(byEvent(invitations, ev))
      .groupBy(invitations.side);
    const lost = used.filter((u) => !keys.has(u.side));
    if (lost.length > 0) {
      const current = await eventSides(ev, db);
      const detail = lost
        .map(
          (u) =>
            `${u.total} ${u.total === 1 ? "convite usa" : "convites usam"} o lado "${sideLabel(current, u.side)}"`,
        )
        .join("; ");
      return invalid(c, [
        { message: `Não dá para tirar um lado em uso: ${detail}. Mude esses convites antes.` },
      ]);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(events)
        .set({ type: input.type, updatedAt: new Date() })
        .where(eq(events.id, ev.id));
      await writeSetting(ev, tx, "event.modules", input.modules, true);
      await writeSetting(ev, tx, "event.sides", input.sides, false);
      await writeSetting(ev, tx, "event.vocabulary", input.vocabulary, true);
    });
    // O tipo vive no cache do resolver (60 s); sem isto o site e as rotas veriam o tipo antigo.
    resolverFor(db, deps.eventResolver).invalidate(ev.id);
    await deps.revalidate(ev.id, ["site", "gifts", "messages"]);
    const fresh = { ...ev, type: input.type };
    return c.json(await configDto(fresh));
  });

  return app;
}
