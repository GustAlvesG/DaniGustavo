import {
  and,
  asc,
  count,
  createEventRecord,
  eq,
  eventDomains,
  EventInputError,
  events,
  giftOrders,
  guests,
  inArray,
  invitations,
  isEventSlugAvailable,
  sql,
  type Database,
} from "@casamento/db";
import {
  CreateOrgEventInput,
  EventSlug,
  limitMessage,
  localDateTimeToIso,
  UpdateOrgEventInput,
  type OrgDashboard,
  type OrgEventSummary,
  type SlugCheck,
} from "@casamento/shared";
import { Hono } from "hono";
import { ERROR_CODES, errorBody, routeNotFound } from "../../errors.ts";
import { checkPlanLimit } from "../../plans/limits.ts";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import { resolverFor } from "../../tenancy/resolver.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import { invalid, type AdminDeps } from "../context.ts";

/*
 * Fase 3, frente A (docs/saas/fase-3.md): eventos e dashboard da organização.
 *
 * - GET   /api/admin/orgs/:orgId/dashboard               → OrgDashboard
 * - GET   /api/admin/orgs/:orgId/events                  → { events: OrgEventSummary[] }
 * - GET   /api/admin/orgs/:orgId/events/slug-check?slug= → SlugCheck
 * - POST  /api/admin/orgs/:orgId/events                  → CreateOrgEventInput → createEventRecord
 * - PATCH /api/admin/orgs/:orgId/events/:eventId         → { status } (rascunho/ativo/arquivado)
 *
 * Nada de middleware com "*" aqui: `/events/:eventId/{hosts,host-permissions}` são de outras
 * frentes e passam pelo mesmo prefixo.
 */

const ID = /^[1-9]\d{0,15}$/;

/**
 * Eventos da organização com os números de cada um. Os eventos saem filtrados por
 * `organization_id`; as tabelas de evento (convites, convidados, pedidos) só entram por
 * `event_id IN (<eventos da org>)`, então nada de outra organização é lido.
 */
export async function loadOrgEventSummaries(
  db: Database,
  orgId: number,
  onlyEventId?: number,
): Promise<OrgEventSummary[]> {
  const rows = await db
    .select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      type: events.type,
      status: events.status,
      timezone: events.timezone,
      startsAt: events.startsAt,
    })
    .from(events)
    .where(
      onlyEventId
        ? and(eq(events.organizationId, orgId), eq(events.id, onlyEventId))
        : eq(events.organizationId, orgId),
    )
    .orderBy(asc(sql`${events.startsAt} is null`), asc(events.startsAt), asc(events.id));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [hosts, invs, people, orders] = await Promise.all([
    db
      .select({ eventId: eventDomains.eventId, host: eventDomains.host })
      .from(eventDomains)
      .where(and(inArray(eventDomains.eventId, ids), eq(eventDomains.isPrimary, true))),
    db
      .select({ eventId: invitations.eventId, n: count() })
      .from(invitations)
      .where(inArray(invitations.eventId, ids))
      .groupBy(invitations.eventId),
    db
      .select({
        eventId: guests.eventId,
        n: count(),
        confirmed: sql<string>`coalesce(sum(${guests.rsvpStatus} = 'confirmed'), 0)`,
      })
      .from(guests)
      .where(inArray(guests.eventId, ids))
      .groupBy(guests.eventId),
    db
      .select({
        eventId: giftOrders.eventId,
        n: count(),
        cents: sql<string>`coalesce(sum(${giftOrders.amountCents}), 0)`,
      })
      .from(giftOrders)
      .where(and(inArray(giftOrders.eventId, ids), eq(giftOrders.status, "paid")))
      .groupBy(giftOrders.eventId),
  ]);

  const hostBy = new Map(hosts.map((h) => [h.eventId, h.host]));
  const invBy = new Map(invs.map((r) => [r.eventId, Number(r.n)]));
  const peopleBy = new Map(people.map((r) => [r.eventId, r]));
  const orderBy = new Map(orders.map((r) => [r.eventId, r]));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    type: r.type,
    status: r.status,
    timezone: r.timezone,
    startsAt: r.startsAt ? r.startsAt.toISOString() : null,
    primaryHost: hostBy.get(r.id) ?? null,
    invitations: invBy.get(r.id) ?? 0,
    guests: Number(peopleBy.get(r.id)?.n ?? 0),
    confirmed: Number(peopleBy.get(r.id)?.confirmed ?? 0),
    giftsPaid: Number(orderBy.get(r.id)?.n ?? 0),
    giftsReceivedCents: Number(orderBy.get(r.id)?.cents ?? 0),
  }));
}

export function orgDashboardRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<OrgAdminEnv>();
  app.get("/", requireOrgPermission("org.read"), async (c) => {
    const org = c.get("org");
    const list = await loadOrgEventSummaries(db, org.id);
    const body: OrgDashboard = {
      organization: { id: org.id, slug: org.slug, name: org.name },
      role: c.get("orgRole"),
      events: list,
      totals: {
        events: list.length,
        guests: list.reduce((s, e) => s + e.guests, 0),
        confirmed: list.reduce((s, e) => s + e.confirmed, 0),
        giftsReceivedCents: list.reduce((s, e) => s + e.giftsReceivedCents, 0),
      },
    };
    return c.json(body);
  });
  return app;
}

export function orgEventRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<OrgAdminEnv>();

  app.get("/", requireOrgPermission("org.read"), async (c) =>
    c.json({ events: await loadOrgEventSummaries(db, c.get("org").id) }),
  );

  app.get("/slug-check", requireOrgPermission("events.create"), async (c) => {
    const raw = (c.req.query("slug") ?? "").trim().toLowerCase();
    const parsed = EventSlug.safeParse(raw);
    let body: SlugCheck;
    if (!parsed.success) {
      body = {
        slug: raw,
        available: false,
        message: parsed.error.issues[0]?.message ?? "Endereço inválido.",
      };
    } else {
      const available = await isEventSlugAvailable(db, parsed.data);
      body = {
        slug: parsed.data,
        available,
        message: available ? null : "Esse endereço já está em uso. Escolha outro.",
      };
    }
    return c.json(body);
  });

  app.post("/", requireOrgPermission("events.create"), async (c) => {
    const org = c.get("org");
    const parsed = CreateOrgEventInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const input = parsed.data;
    // Fase 6: evento que já nasce ativo conta no limite de eventos ativos do plano.
    if (input.status === "active") {
      const limit = await checkPlanLimit(db, org.id, { kind: "activeEvents", adding: 1 });
      if (!limit.ok) {
        return c.json(errorBody(ERROR_CODES.planLimit, limitMessage(limit.kind, limit.limit)), 409);
      }
    }
    try {
      const created = await createEventRecord(db, {
        organizationId: org.id,
        slug: input.slug,
        name: input.name,
        type: input.type,
        startsAt: localDateTimeToIso(input.date, input.time, input.timezone),
        timezone: input.timezone,
        status: input.status,
        host: input.host || null,
      });
      const [summary] = await loadOrgEventSummaries(db, org.id, created.id);
      return c.json({ event: summary }, 201);
    } catch (error) {
      if (error instanceof EventInputError) {
        const taken = error.reason === "taken";
        return c.json(
          errorBody(
            taken ? ERROR_CODES.conflict : ERROR_CODES.invalidRequest,
            error.message,
            error.field,
          ),
          taken ? 409 : 422,
        );
      }
      throw error;
    }
  });

  app.patch("/:eventId", requireOrgPermission("events.create"), async (c) => {
    const org = c.get("org");
    const raw = c.req.param("eventId");
    const eventId = ID.test(raw) ? Number(raw) : null;
    // Evento de outra organização (ou inexistente) recebe o mesmo 404 de rota.
    if (!eventId) return routeNotFound(c);
    const [current] = await db
      .select({ id: events.id, status: events.status })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.organizationId, org.id)));
    if (!current) return routeNotFound(c);

    const parsed = UpdateOrgEventInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    // Fase 6: ativar conta no limite de eventos ativos do plano.
    if (parsed.data.status === "active" && current.status !== "active") {
      const limit = await checkPlanLimit(db, org.id, { kind: "activeEvents", adding: 1 });
      if (!limit.ok) {
        return c.json(errorBody(ERROR_CODES.planLimit, limitMessage(limit.kind, limit.limit)), 409);
      }
    }
    await db
      .update(events)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(and(eq(events.id, eventId), eq(events.organizationId, org.id)));
    // O status vive no cache do resolver (60 s) e o site público passa de 404 a aberto.
    resolverFor(db, deps.eventResolver).invalidate(eventId);
    await deps.revalidate(eventId, ["site"]);
    const [summary] = await loadOrgEventSummaries(db, org.id, eventId);
    return c.json({ event: summary });
  });

  return app;
}
