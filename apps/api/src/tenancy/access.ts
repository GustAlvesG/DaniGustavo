import {
  and,
  asc,
  eq,
  eventMembers,
  events,
  organizationMembers,
  organizations,
  type Database,
} from "@casamento/db";
import type { MiddlewareHandler } from "hono";
import type { AdminUser } from "../admin/context.ts";
import { routeNotFound } from "../errors.ts";
import type { EventResolver } from "./resolver.ts";
import {
  EVENT_ACCESS_ROLES,
  type EventAccessRole,
  type EventAdminEnv,
  type EventCtx,
} from "./types.ts";

type AccessUser = Pick<AdminUser, "id" | "platformRole">;

const strongest = (a: EventAccessRole, b: EventAccessRole) =>
  EVENT_ACCESS_ROLES.indexOf(a) <= EVENT_ACCESS_ROLES.indexOf(b) ? a : b;

/** Papel do usuário no evento, ou null se não tem acesso. Sem cache: vínculos valem na hora. */
export async function resolveEventRole(
  db: Database,
  user: AccessUser,
  event: Pick<EventCtx, "id" | "orgId">,
): Promise<EventAccessRole | null> {
  if (user.platformRole === "admin") return "platform_admin";
  const [org] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, event.orgId),
        eq(organizationMembers.userId, user.id),
      ),
    );
  if (org) return org.role === "owner" ? "org_owner" : "org_member";
  const [member] = await db
    .select({ role: eventMembers.role })
    .from(eventMembers)
    .where(and(eq(eventMembers.eventId, event.id), eq(eventMembers.userId, user.id)));
  return member ? "event_host" : null;
}

export interface AccessibleEvent extends EventCtx {
  orgName: string;
  role: EventAccessRole;
}

const eventColumns = {
  id: events.id,
  slug: events.slug,
  orgId: events.organizationId,
  timezone: events.timezone,
  name: events.name,
  type: events.type,
  status: events.status,
  orgName: organizations.name,
};

/** Eventos que o usuário vê no painel, com o papel mais forte em cada um. */
export async function listAccessibleEvents(
  db: Database,
  user: AccessUser,
): Promise<AccessibleEvent[]> {
  const base = () =>
    db
      .select(eventColumns)
      .from(events)
      .innerJoin(organizations, eq(organizations.id, events.organizationId));

  if (user.platformRole === "admin") {
    const rows = await base().orderBy(asc(events.id));
    return rows.map((r) => ({ ...r, role: "platform_admin" as const }));
  }

  const [viaOrg, viaEvent] = await Promise.all([
    db
      .select({ ...eventColumns, orgRole: organizationMembers.role })
      .from(events)
      .innerJoin(organizations, eq(organizations.id, events.organizationId))
      .innerJoin(
        organizationMembers,
        and(
          eq(organizationMembers.organizationId, events.organizationId),
          eq(organizationMembers.userId, user.id),
        ),
      ),
    base().innerJoin(
      eventMembers,
      and(eq(eventMembers.eventId, events.id), eq(eventMembers.userId, user.id)),
    ),
  ]);

  const byId = new Map<number, AccessibleEvent>();
  const add = (row: EventCtx & { orgName: string }, role: EventAccessRole) => {
    const current = byId.get(row.id);
    byId.set(row.id, { ...row, role: current ? strongest(current.role, role) : role });
  };
  for (const { orgRole, ...row } of viaOrg) {
    add(row, orgRole === "owner" ? "org_owner" : "org_member");
  }
  for (const row of viaEvent) add(row, "event_host");
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

const EVENT_ID = /^[1-9]\d{0,15}$/;

/**
 * `/api/admin/events/:eventId/*`, depois de requireSession. Põe `event` e `eventRole` no
 * contexto. eventId inválido, evento inexistente ou sem acesso → o mesmo 404 de rota
 * inexistente (quem é de fora não descobre quais ids existem).
 */
export function requireEventAccess(
  db: Database,
  resolver: EventResolver,
): MiddlewareHandler<EventAdminEnv> {
  return async (c, next) => {
    const raw = c.req.param("eventId");
    if (!raw || !EVENT_ID.test(raw) || !Number.isSafeInteger(Number(raw))) {
      return routeNotFound(c);
    }
    const event = await resolver.byId(Number(raw));
    if (!event) return routeNotFound(c);
    const role = await resolveEventRole(db, c.get("user"), event);
    if (!role) return routeNotFound(c);
    c.set("event", event);
    c.set("eventRole", role);
    await next();
  };
}
