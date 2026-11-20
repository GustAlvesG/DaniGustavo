import { and, asc, eq, eventMembers, user, type Database } from "@casamento/db";
import { HostInviteInput, type EventHostRow } from "@casamento/shared";
import { Hono } from "hono";
import { handleInviteErrors } from "../../team-invites/http.ts";
import { createInvite, listInvites } from "../../team-invites/service.ts";
import { requireOrgPermission, type OrgEventEnv } from "../../tenancy/org-access.ts";
import { invalid, notFound, readJson, sensitiveLimit, type AdminDeps } from "../context.ts";

/*
 * Fase 3, frente B (docs/saas/fase-3.md): anfitriões de um evento da organização. Montado em
 * /api/admin/orgs/:orgId/events/:eventId/hosts atrás de requireOrgEvent (`event` no contexto).
 *
 * - GET    /         → { hosts: EventHostRow[], invites: TeamInvite[] }
 * - POST   /         → HostInviteInput (convite por e-mail; conta existente também recebe convite)
 * - DELETE /:userId  → remove o vínculo em event_members (a conta continua existindo)
 */

async function listHosts(db: Database, eventId: number): Promise<EventHostRow[]> {
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      since: eventMembers.createdAt,
    })
    .from(eventMembers)
    .innerJoin(user, eq(user.id, eventMembers.userId))
    .where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.role, "host")))
    .orderBy(asc(eventMembers.createdAt), asc(eventMembers.id));
  return rows.map((r) => ({ ...r, since: r.since.toISOString() }));
}

export function orgEventHostRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<OrgEventEnv>();

  const view = async (orgId: number, eventId: number) => ({
    hosts: await listHosts(db, eventId),
    invites: await listInvites(db, orgId, deps.now(), eventId),
  });

  app.get("/", requireOrgPermission("org.read"), async (c) =>
    c.json(await view(c.get("org").id, c.get("event").id)),
  );

  app.post(
    "/",
    requireOrgPermission("hosts.manage"),
    sensitiveLimit(deps.limiter, "team-invite"),
    (c) =>
      handleInviteErrors(c, async () => {
        const parsed = HostInviteInput.safeParse(await readJson(c));
        if (!parsed.success) return invalid(c, parsed.error.issues);
        const ev = c.get("event");
        const u = c.get("user");
        const invite = await createInvite(deps, {
          org: c.get("org"),
          event: { id: ev.id, name: ev.name },
          email: parsed.data.email,
          role: "host",
          inviter: { id: u.id, name: u.name },
        });
        return c.json({ invite }, 201);
      }),
  );

  app.delete("/:userId", requireOrgPermission("hosts.manage"), async (c) => {
    const ev = c.get("event");
    const [res] = await db
      .delete(eventMembers)
      .where(and(eq(eventMembers.eventId, ev.id), eq(eventMembers.userId, c.req.param("userId"))));
    if (res.affectedRows === 0) return notFound(c, "Anfitrião");
    return c.json(await view(c.get("org").id, ev.id));
  });
  return app;
}
