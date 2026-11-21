import {
  and,
  asc,
  byEvent,
  desc,
  eq,
  eventTasks,
  quotes,
  scheduleItems,
  sql,
  vendorContracts,
  type Database,
} from "@casamento/db";
import {
  vendorCategoryLabel,
  type VendorPortalDocument,
  type VendorPortalMe,
  type VendorPortalQuote,
  type VendorPortalSchedule,
  type VendorPortalTask,
} from "@casamento/shared";
import { toLocalParts } from "../schedule/time.ts";
import { customLabels } from "../vendors/categories.ts";
import type { PortalCtx } from "./session.ts";

/*
 * Fase 7, frente C: o que o fornecedor vê no portal. Toda consulta filtra pelo evento do link
 * (`byEvent`) e pelo `event_vendor_id` dele; do resto do evento só sai o roteiro do dia, sem os
 * detalhes dos itens alheios. Nada de convidados, valores de outros fornecedores ou dados da
 * organização.
 */

export async function portalMe(db: Database, p: PortalCtx): Promise<VendorPortalMe> {
  const custom = await customLabels(db, p.ev.orgId);
  return {
    event: {
      name: p.ev.name,
      startsAt: p.ev.startsAt?.toISOString() ?? null,
      timezone: p.ev.timezone,
    },
    vendor: { name: p.vendorName, category: vendorCategoryLabel(p.category, custom) },
    expiresAt: p.expiresAt.toISOString(),
  };
}

export async function portalSchedule(db: Database, p: PortalCtx): Promise<VendorPortalSchedule> {
  const rows = await db
    .select({
      startsAt: scheduleItems.startsAt,
      endsAt: scheduleItems.endsAt,
      title: scheduleItems.title,
      location: scheduleItems.location,
      details: scheduleItems.details,
      eventVendorId: scheduleItems.eventVendorId,
    })
    .from(scheduleItems)
    .where(byEvent(scheduleItems, p.ev))
    .orderBy(asc(scheduleItems.startsAt), asc(scheduleItems.sort), asc(scheduleItems.id));
  const tz = p.ev.timezone;
  return {
    timezone: tz,
    items: rows.map((r) => {
      const start = toLocalParts(r.startsAt, tz);
      const mine = r.eventVendorId === p.eventVendorId;
      return {
        date: start.date,
        startTime: start.time,
        endTime: r.endsAt ? toLocalParts(r.endsAt, tz).time : null,
        title: r.title,
        location: r.location,
        details: mine ? r.details : null,
        mine,
      };
    }),
  };
}

export async function portalTasks(db: Database, p: PortalCtx): Promise<VendorPortalTask[]> {
  const rows = await db
    .select({
      id: eventTasks.id,
      title: eventTasks.title,
      description: eventTasks.description,
      dueOn: eventTasks.dueOn,
      status: eventTasks.status,
    })
    .from(eventTasks)
    .where(and(byEvent(eventTasks, p.ev), eq(eventTasks.eventVendorId, p.eventVendorId)))
    .orderBy(
      asc(sql`${eventTasks.dueOn} is null`),
      asc(eventTasks.dueOn),
      asc(eventTasks.sort),
      asc(eventTasks.id),
    );
  return rows;
}

export async function portalQuotes(
  db: Database,
  p: PortalCtx,
  onlyId?: number,
): Promise<VendorPortalQuote[]> {
  const rows = await db
    .select({
      id: quotes.id,
      title: quotes.title,
      status: quotes.status,
      totalCents: quotes.totalCents,
      source: quotes.source,
      createdAt: quotes.createdAt,
    })
    .from(quotes)
    .where(
      and(
        byEvent(quotes, p.ev),
        eq(quotes.eventVendorId, p.eventVendorId),
        onlyId === undefined ? undefined : eq(quotes.id, onlyId),
      ),
    )
    .orderBy(desc(quotes.createdAt), desc(quotes.id));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

type ContractRecord = typeof vendorContracts.$inferSelect;

export const toPortalDocument = (r: ContractRecord): VendorPortalDocument => ({
  id: r.id,
  title: r.title,
  originalName: r.originalName,
  mime: r.mime,
  bytes: r.bytes,
  source: r.source,
  createdAt: r.createdAt.toISOString(),
});

export async function portalDocuments(db: Database, p: PortalCtx): Promise<ContractRecord[]> {
  return db
    .select()
    .from(vendorContracts)
    .where(and(byEvent(vendorContracts, p.ev), eq(vendorContracts.eventVendorId, p.eventVendorId)))
    .orderBy(desc(vendorContracts.createdAt), desc(vendorContracts.id));
}

/** Um documento do próprio fornecedor (de outro fornecedor ou evento → null). */
export async function portalDocument(db: Database, p: PortalCtx, id: number) {
  const [row] = await db
    .select()
    .from(vendorContracts)
    .where(
      and(
        byEvent(vendorContracts, p.ev),
        eq(vendorContracts.eventVendorId, p.eventVendorId),
        eq(vendorContracts.id, id),
      ),
    );
  return row ?? null;
}
