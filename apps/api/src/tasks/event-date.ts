import { and, eq, events, eventSettings, type Database } from "@casamento/db";
import type { EventCtx } from "../tenancy/types.ts";
import { resolverFor } from "../tenancy/resolver.ts";
import type { EventResolver } from "../tenancy/resolver.ts";
import { recalculateTaskDues } from "./service.ts";

/*
 * Data e fuso do evento (Fase 6, frente E): o que muda depois que `events.starts_at/timezone`
 * mudam, compartilhado entre `PUT /settings` (admin/content.ts) e o PATCH da organização.
 */

export interface EventDate {
  startsAt: Date | null;
  timezone: string;
}

/** Data/fuso vivem no cache do resolver (60 s) e os prazos relativos das tarefas seguem a data. */
export async function afterEventDateChange(
  db: Database,
  resolver: EventResolver | undefined,
  ev: EventCtx,
  next: EventDate,
): Promise<number> {
  resolverFor(db, resolver).invalidate(ev.id);
  return recalculateTaskDues(db, { ...ev, ...next });
}

/**
 * Grava a data do evento como o `PUT /settings` grava: `events.starts_at/timezone` e as chaves
 * públicas `wedding.datetime` (ISO com offset) / `wedding.timezone`, na mesma transação.
 */
export async function saveEventDate(
  db: Database,
  ev: EventCtx,
  next: { startsAt: Date; timezone: string; datetimeIso: string },
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const [key, value] of [
      ["wedding.datetime", next.datetimeIso],
      ["wedding.timezone", next.timezone],
    ] as const) {
      await tx
        .insert(eventSettings)
        .values({ eventId: ev.id, key, value, isPublic: true })
        .onDuplicateKeyUpdate({ set: { value, updatedAt: now } });
    }
    await tx
      .update(events)
      .set({ startsAt: next.startsAt, timezone: next.timezone, updatedAt: now })
      .where(and(eq(events.id, ev.id), eq(events.organizationId, ev.orgId)));
  });
}
