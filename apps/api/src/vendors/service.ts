import {
  and,
  count,
  eq,
  events,
  eventVendors,
  inArray,
  vendors,
  type Database,
} from "@casamento/db";
import type { VendorInput, VendorRow, VendorUpdate } from "@casamento/shared";
import { crossEvent } from "../tenancy/cross-event.ts";

/* Catálogo de fornecedores da organização (Fase 4, frente B). */

export type VendorRecord = typeof vendors.$inferSelect;

/** CPF/CNPJ: guarda só os dígitos; 11 ou 14, senão inválido. */
export function normalizeDocument(raw: string | null | undefined): string | null | "invalid" {
  if (raw === null || raw === undefined) return null;
  if (/[^\d.\-/\s]/.test(raw)) return "invalid";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw.trim() ? "invalid" : null;
  return digits.length === 11 || digits.length === 14 ? digits : "invalid";
}

export const INVALID_DOCUMENT = "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.";

export function toVendorRow(v: VendorRecord, eventCount: number): VendorRow {
  return {
    id: v.id,
    name: v.name,
    category: v.category as VendorRow["category"],
    contactName: v.contactName,
    email: v.email,
    phone: v.phone,
    website: v.website,
    document: v.document,
    notes: v.notes,
    rating: v.rating,
    archived: v.archivedAt !== null,
    eventCount,
  };
}

/** Em quantos eventos cada fornecedor da organização está (consulta entre eventos de propósito). */
export async function eventCounts(
  db: Database,
  orgId: number,
  vendorIds: number[],
): Promise<Map<number, number>> {
  if (!vendorIds.length) return new Map();
  const rows = await crossEvent(
    "catálogo da organização: eventos por fornecedor",
    async () =>
      await db
        .select({ vendorId: eventVendors.vendorId, n: count() })
        .from(eventVendors)
        .where(
          and(eq(eventVendors.organizationId, orgId), inArray(eventVendors.vendorId, vendorIds)),
        )
        .groupBy(eventVendors.vendorId),
  );
  return new Map(rows.map((r) => [r.vendorId, Number(r.n)]));
}

export async function findVendor(
  db: Database,
  orgId: number,
  id: number,
): Promise<VendorRecord | undefined> {
  const [row] = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, id), eq(vendors.organizationId, orgId)));
  return row;
}

export async function vendorRow(
  db: Database,
  orgId: number,
  id: number,
): Promise<VendorRow | null> {
  const v = await findVendor(db, orgId, id);
  if (!v) return null;
  return toVendorRow(v, (await eventCounts(db, orgId, [id])).get(id) ?? 0);
}

/** Valores de um VendorInput prontos para o insert (documento já normalizado). */
export function vendorValues(input: VendorInput, document: string | null) {
  return {
    name: input.name,
    category: input.category,
    contactName: input.contactName,
    email: input.email,
    phone: input.phone,
    website: input.website,
    document,
    notes: input.notes,
    rating: input.rating,
  };
}

/** Só os campos enviados (PATCH): o `rating` tem default no schema, então confere a chave. */
export function vendorChanges(
  parsed: VendorUpdate,
  raw: Record<string, unknown>,
  document: string | null | undefined,
) {
  const changes: Record<string, unknown> = {};
  for (const key of [
    "name",
    "category",
    "contactName",
    "email",
    "phone",
    "website",
    "notes",
  ] as const) {
    if (parsed[key] !== undefined) changes[key] = parsed[key];
  }
  if ("rating" in raw) changes["rating"] = parsed.rating ?? null;
  if (document !== undefined) changes["document"] = document;
  if (parsed.archived !== undefined) changes["archivedAt"] = parsed.archived ? new Date() : null;
  return changes;
}

/** Eventos da organização em que o fornecedor está. */
export async function vendorEvents(db: Database, orgId: number, vendorId: number) {
  return crossEvent(
    "catálogo da organização: eventos do fornecedor",
    async () =>
      await db
        .select({ id: events.id, name: events.name, status: events.status })
        .from(eventVendors)
        .innerJoin(events, eq(events.id, eventVendors.eventId))
        .where(and(eq(eventVendors.organizationId, orgId), eq(eventVendors.vendorId, vendorId))),
  );
}
