import { and, byEvent, eq, eventSettings, type Database } from "@casamento/db";
import type { EventCtx } from "../tenancy/types.ts";

/** Valor de uma chave de `event_settings` do evento (undefined = não gravada). */
export async function readSetting(ev: EventCtx, db: Database, key: string): Promise<unknown> {
  const [row] = await db
    .select({ value: eventSettings.value })
    .from(eventSettings)
    .where(and(byEvent(eventSettings, ev), eq(eventSettings.key, key)));
  return row?.value;
}

/** Grava (insere ou troca) uma chave; `isPublic` só vale na primeira gravação. */
export async function writeSetting(
  ev: EventCtx,
  db: Pick<Database, "insert">,
  key: string,
  value: unknown,
  isPublic: boolean,
): Promise<void> {
  await db
    .insert(eventSettings)
    .values({ eventId: ev.id, key, value, isPublic })
    .onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
}
