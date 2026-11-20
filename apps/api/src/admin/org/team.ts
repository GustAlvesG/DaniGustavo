import { and, asc, eq, organizationMembers, user, type Database } from "@casamento/db";
import { OrgInviteInput, OrgMemberUpdate, type OrgMember } from "@casamento/shared";
import { Hono, type Context } from "hono";
import { apiError, ERROR_CODES } from "../../errors.ts";
import { handleInviteErrors, parseRouteId } from "../../team-invites/http.ts";
import {
  createInvite,
  listInvites,
  openInvite,
  resendInvite,
  revokeInvite,
  TeamInviteError,
} from "../../team-invites/service.ts";
import { canOrg, requireOrgPermission } from "../../tenancy/org-access.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import { invalid, readJson, sensitiveLimit, type AdminDeps } from "../context.ts";

/*
 * Fase 3, frente B (docs/saas/fase-3.md): equipe da organização e convites por e-mail.
 *
 * - GET    /api/admin/orgs/:orgId/members           → { members: OrgMember[] }
 * - PATCH  /api/admin/orgs/:orgId/members/:userId   → OrgMemberUpdate (a org nunca fica sem dono)
 * - DELETE /api/admin/orgs/:orgId/members/:userId   → remove (idem)
 * - GET    /api/admin/orgs/:orgId/invites           → { invites: TeamInvite[] } (equipe e anfitriões)
 * - POST   /api/admin/orgs/:orgId/invites           → OrgInviteInput (convite para a equipe)
 * - DELETE /api/admin/orgs/:orgId/invites/:inviteId → revoga (de equipe: confere team.manage dentro)
 * - POST   /api/admin/orgs/:orgId/invites/:inviteId/resend → novo token, nova validade, novo e-mail
 */

const LAST_OWNER =
  "A organização precisa de pelo menos um dono. Promova outra pessoa a dono antes.";

export async function listMembers(db: Database, orgId: number): Promise<OrgMember[]> {
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: organizationMembers.role,
      since: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(user, eq(user.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, orgId))
    .orderBy(asc(organizationMembers.createdAt), asc(organizationMembers.id));
  return rows.map((r) => ({ ...r, since: r.since.toISOString() }));
}

/**
 * Muda o papel ou remove alguém da equipe numa transação, travando as linhas da equipe
 * (`FOR UPDATE`): duas remoções simultâneas nunca deixam a organização sem dono.
 */
async function changeMember(
  db: Database,
  orgId: number,
  userId: string,
  change: { role: "owner" | "member" } | "remove",
) {
  await db.transaction(async (tx) => {
    const members = await tx
      .select({ userId: organizationMembers.userId, role: organizationMembers.role })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, orgId))
      .for("update");
    const target = members.find((m) => m.userId === userId);
    if (!target) throw new TeamInviteError(404, "Pessoa não encontrada na equipe.");
    const owners = members.filter((m) => m.role === "owner").length;
    const losesOwner = target.role === "owner" && (change === "remove" || change.role !== "owner");
    if (losesOwner && owners <= 1) throw new TeamInviteError(422, LAST_OWNER);
    const where = and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.userId, userId),
    );
    if (change === "remove") await tx.delete(organizationMembers).where(where);
    else await tx.update(organizationMembers).set({ role: change.role }).where(where);
  });
}

export function orgMemberRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<OrgAdminEnv>();

  app.get("/", requireOrgPermission("org.read"), async (c) =>
    c.json({ members: await listMembers(db, c.get("org").id) }),
  );

  app.patch("/:userId", requireOrgPermission("team.manage"), (c) =>
    handleInviteErrors(c, async () => {
      const parsed = OrgMemberUpdate.safeParse(await readJson(c));
      if (!parsed.success) return invalid(c, parsed.error.issues);
      const orgId = c.get("org").id;
      await changeMember(db, orgId, c.req.param("userId"), { role: parsed.data.role });
      return c.json({ members: await listMembers(db, orgId) });
    }),
  );

  app.delete("/:userId", requireOrgPermission("team.manage"), (c) =>
    handleInviteErrors(c, async () => {
      const orgId = c.get("org").id;
      await changeMember(db, orgId, c.req.param("userId"), "remove");
      return c.json({ members: await listMembers(db, orgId) });
    }),
  );
  return app;
}

const inviterOf = (c: Context<OrgAdminEnv>) => {
  const u = c.get("user");
  return { id: u.id, name: u.name };
};

const forbidden = (c: Context) =>
  apiError(
    c,
    403,
    ERROR_CODES.unauthorized,
    "Você não tem permissão para fazer isso nesta organização.",
  );

export function orgInviteRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<OrgAdminEnv>();

  app.get("/", requireOrgPermission("org.read"), async (c) =>
    c.json({ invites: await listInvites(db, c.get("org").id, deps.now()) }),
  );

  app.post(
    "/",
    requireOrgPermission("team.manage"),
    sensitiveLimit(deps.limiter, "team-invite"),
    (c) =>
      handleInviteErrors(c, async () => {
        const parsed = OrgInviteInput.safeParse(await readJson(c));
        if (!parsed.success) return invalid(c, parsed.error.issues);
        const invite = await createInvite(deps, {
          org: c.get("org"),
          event: null,
          email: parsed.data.email,
          role: parsed.data.role,
          inviter: inviterOf(c),
        });
        return c.json({ invite }, 201);
      }),
  );

  /** Convite da equipe exige team.manage; o de anfitrião basta hosts.manage (da rota). */
  async function allowed(c: Context<OrgAdminEnv>): Promise<number | null> {
    const inviteId = parseRouteId(c.req.param("inviteId"));
    if (!inviteId) throw new TeamInviteError(404, "Convite não encontrado.");
    const { row } = await openInvite(db, c.get("org").id, inviteId, deps.now());
    if (row.eventId === null && !canOrg(c.get("orgRole"), "team.manage")) return null;
    return inviteId;
  }

  app.delete("/:inviteId", requireOrgPermission("hosts.manage"), (c) =>
    handleInviteErrors(c, async () => {
      const inviteId = await allowed(c);
      if (!inviteId) return forbidden(c);
      await revokeInvite(db, c.get("org").id, inviteId, deps.now());
      return c.json({ ok: true });
    }),
  );

  app.post(
    "/:inviteId/resend",
    requireOrgPermission("hosts.manage"),
    sensitiveLimit(deps.limiter, "team-invite"),
    (c) =>
      handleInviteErrors(c, async () => {
        const inviteId = await allowed(c);
        if (!inviteId) return forbidden(c);
        const invite = await resendInvite(deps, c.get("org"), inviteId, inviterOf(c));
        return c.json({ invite });
      }),
  );
  return app;
}
