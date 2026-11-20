import { Hono } from "hono";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import type { AdminDeps } from "../context.ts";
import { notYet } from "./stub.ts";

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

export function orgMemberRoutes(deps: AdminDeps) {
  void deps; // a frente usa deps (db, mailer, limiter...)
  const app = new Hono<OrgAdminEnv>();
  // TODO(fase3-B)
  app.get("/", requireOrgPermission("org.read"), (c) => notYet(c, "Equipe"));
  app.patch("/:userId", requireOrgPermission("team.manage"), (c) => notYet(c, "Mudar papel"));
  app.delete("/:userId", requireOrgPermission("team.manage"), (c) =>
    notYet(c, "Remover da equipe"),
  );
  return app;
}

export function orgInviteRoutes(deps: AdminDeps) {
  void deps; // a frente usa deps (db, mailer, limiter...)
  const app = new Hono<OrgAdminEnv>();
  // TODO(fase3-B)
  app.get("/", requireOrgPermission("org.read"), (c) => notYet(c, "Convites pendentes"));
  app.post("/", requireOrgPermission("team.manage"), (c) => notYet(c, "Convidar para a equipe"));
  app.delete("/:inviteId", requireOrgPermission("hosts.manage"), (c) =>
    notYet(c, "Cancelar convite"),
  );
  app.post("/:inviteId/resend", requireOrgPermission("hosts.manage"), (c) =>
    notYet(c, "Reenviar convite"),
  );
  return app;
}
