import {
  and,
  asc,
  byEvent,
  desc,
  eq,
  eventVendors,
  scheduleItems,
  vendors,
  type Database,
} from "@casamento/db";
import {
  ScheduleItemInput,
  ScheduleItemUpdate,
  type ScheduleItemRow,
  type ScheduleView,
} from "@casamento/shared";
import { Hono } from "hono";
import { ERROR_CODES, errorBody } from "../errors.ts";
import { resolveRange, toLocalParts } from "../schedule/time.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv, EventCtx } from "../tenancy/types.ts";
import { invalid, notFound, readJson, type AdminDeps } from "./context.ts";

/*
 * Fase 4, frente D (docs/saas/fase-4.md): cronograma do dia, em
 * /api/admin/events/:eventId/schedule.
 *
 * - GET    /         → ScheduleView
 * - POST   /         ScheduleItemInput → { item: ScheduleItemRow }
 * - PATCH  /:itemId  ScheduleItemUpdate → { item }
 * - DELETE /:itemId  → { ok }
 */

type Row = typeof scheduleItems.$inferSelect;

/** Fornecedores do evento (id → nome), com a junção por organização e evento. */
async function vendorNames(ev: EventCtx, db: Database): Promise<Map<number, string>> {
  const rows = await db
    .select({ id: eventVendors.id, name: vendors.name })
    .from(eventVendors)
    .innerJoin(
      vendors,
      and(
        eq(vendors.organizationId, eventVendors.organizationId),
        eq(vendors.id, eventVendors.vendorId),
      ),
    )
    .where(eq(eventVendors.eventId, ev.id));
  return new Map(rows.map((r) => [r.id, r.name]));
}

function toRow(ev: EventCtx, r: Row, names: Map<number, string>): ScheduleItemRow {
  const start = toLocalParts(r.startsAt, ev.timezone);
  const end = r.endsAt ? toLocalParts(r.endsAt, ev.timezone) : null;
  const name = r.eventVendorId ? names.get(r.eventVendorId) : undefined;
  return {
    id: r.id,
    date: start.date,
    startTime: start.time,
    endTime: end?.time ?? null,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt?.toISOString() ?? null,
    title: r.title,
    details: r.details,
    location: r.location,
    responsible: r.responsible,
    eventVendor: r.eventVendorId && name ? { id: r.eventVendorId, name } : null,
    sort: r.sort,
  };
}

const bad = (message: string, field: string) =>
  errorBody(ERROR_CODES.invalidRequest, message, field);

export function adminScheduleRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<EventAdminEnv>();

  const find = async (ev: EventCtx, id: number) =>
    (
      await db
        .select()
        .from(scheduleItems)
        .where(and(byEvent(scheduleItems, ev), eq(scheduleItems.id, id)))
        .limit(1)
    )[0];

  const respond = async (ev: EventCtx, id: number) =>
    toRow(ev, (await find(ev, id))!, await vendorNames(ev, db));

  app.get("/", requirePermission("schedule.read"), async (c) => {
    const ev = c.get("event");
    const [rows, names] = await Promise.all([
      db
        .select()
        .from(scheduleItems)
        .where(byEvent(scheduleItems, ev))
        .orderBy(asc(scheduleItems.startsAt), asc(scheduleItems.sort), asc(scheduleItems.id)),
      vendorNames(ev, db),
    ]);
    const view: ScheduleView = {
      timezone: ev.timezone,
      eventDate: ev.startsAt ? toLocalParts(ev.startsAt, ev.timezone).date : null,
      items: rows.map((r) => toRow(ev, r, names)),
    };
    return c.json(view);
  });

  app.post("/", requirePermission("schedule.write"), async (c) => {
    const ev = c.get("event");
    const parsed = ScheduleItemInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const input = parsed.data;
    const date =
      input.date ?? (ev.startsAt ? toLocalParts(ev.startsAt, ev.timezone).date : undefined);
    if (!date) return c.json(bad("Escolha o dia da atividade.", "date"), 422);
    const range = resolveRange(date, input.startTime, input.endTime, ev.timezone);
    if (!range) return c.json(bad("O fim precisa ser diferente do início.", "endTime"), 422);
    if (input.eventVendorId !== null && !(await vendorNames(ev, db)).has(input.eventVendorId)) {
      return c.json(bad("Esse fornecedor não está ligado a este evento.", "eventVendorId"), 422);
    }
    const [last] = await db
      .select({ sort: scheduleItems.sort })
      .from(scheduleItems)
      .where(byEvent(scheduleItems, ev))
      .orderBy(desc(scheduleItems.sort))
      .limit(1);
    const [res] = await db.insert(scheduleItems).values({
      eventId: ev.id,
      startsAt: range.startsAt,
      endsAt: range.endsAt,
      title: input.title,
      details: input.details,
      location: input.location,
      responsible: input.responsible,
      eventVendorId: input.eventVendorId,
      sort: (last?.sort ?? 0) + 1,
    });
    return c.json({ item: await respond(ev, res.insertId) }, 201);
  });

  app.patch("/:itemId{[0-9]+}", requirePermission("schedule.write"), async (c) => {
    const ev = c.get("event");
    const id = Number(c.req.param("itemId"));
    const current = await find(ev, id);
    if (!current) return notFound(c, "Item do cronograma");
    const parsed = ScheduleItemUpdate.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const input = parsed.data;

    const start = toLocalParts(current.startsAt, ev.timezone);
    const end = current.endsAt ? toLocalParts(current.endsAt, ev.timezone) : null;
    const range = resolveRange(
      input.date ?? start.date,
      input.startTime ?? start.time,
      input.endTime !== undefined ? input.endTime : (end?.time ?? null),
      ev.timezone,
    );
    if (!range) return c.json(bad("O fim precisa ser diferente do início.", "endTime"), 422);
    if (input.eventVendorId != null && !(await vendorNames(ev, db)).has(input.eventVendorId)) {
      return c.json(bad("Esse fornecedor não está ligado a este evento.", "eventVendorId"), 422);
    }
    await db
      .update(scheduleItems)
      .set({
        startsAt: range.startsAt,
        endsAt: range.endsAt,
        ...(input.title !== undefined && { title: input.title }),
        ...(input.details !== undefined && { details: input.details }),
        ...(input.location !== undefined && { location: input.location }),
        ...(input.responsible !== undefined && { responsible: input.responsible }),
        ...(input.eventVendorId !== undefined && { eventVendorId: input.eventVendorId }),
      })
      .where(and(byEvent(scheduleItems, ev), eq(scheduleItems.id, id)));
    return c.json({ item: await respond(ev, id) });
  });

  app.delete("/:itemId{[0-9]+}", requirePermission("schedule.write"), async (c) => {
    const ev = c.get("event");
    const id = Number(c.req.param("itemId"));
    if (!(await find(ev, id))) return notFound(c, "Item do cronograma");
    await db.delete(scheduleItems).where(and(byEvent(scheduleItems, ev), eq(scheduleItems.id, id)));
    return c.json({ ok: true });
  });

  return app;
}
