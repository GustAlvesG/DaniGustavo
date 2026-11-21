import { createHash } from "node:crypto";
import { and, byEvent, eq, eventSettings, type Database } from "@casamento/db";
import { PrivacySettings } from "@casamento/shared";
import type { EventCtx } from "../tenancy/types.ts";

/** Chave privada em `event_settings` (Fase 6, LGPD). */
export const PRIVACY_SETTINGS_KEY = "privacy.settings";

/** Configuração de privacidade do evento; sem linha (ou inválida) = padrões do contrato. */
export async function loadPrivacySettings(ev: EventCtx, db: Database): Promise<PrivacySettings> {
  const [row] = await db
    .select({ value: eventSettings.value })
    .from(eventSettings)
    .where(and(byEvent(eventSettings, ev), eq(eventSettings.key, PRIVACY_SETTINGS_KEY)));
  const parsed = PrivacySettings.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : PrivacySettings.parse({});
}

export async function savePrivacySettings(
  ev: EventCtx,
  db: Database,
  settings: PrivacySettings,
): Promise<void> {
  await db
    .insert(eventSettings)
    .values({ eventId: ev.id, key: PRIVACY_SETTINGS_KEY, value: settings, isPublic: false })
    .onDuplicateKeyUpdate({ set: { value: settings, isPublic: false } });
}

/** Quando a retenção anonimiza o evento (data do evento + prazo), ou null. */
export function retentionDueAt(startsAt: Date | null, settings: PrivacySettings): Date | null {
  if (!startsAt || settings.retentionDays === null) return null;
  return new Date(startsAt.getTime() + settings.retentionDays * 24 * 60 * 60_000);
}

/** SHA-256 do IP: dá para limitar abuso sem guardar o IP em claro. */
export const hashIp = (ip: string) => createHash("sha256").update(ip).digest("hex");
