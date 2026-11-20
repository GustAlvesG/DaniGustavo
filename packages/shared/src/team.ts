import { z } from "zod";
import { Email, PASSWORD_MAX, PASSWORD_MIN } from "./org.ts";

/* Fase 3, frente B (docs/saas/fase-3.md): equipe da organização, convites e aceite. */

export const ORG_MEMBER_ROLES = ["owner", "member"] as const;
export const OrgMemberRole = z.enum(ORG_MEMBER_ROLES, {
  error: "Papel inválido: use dono ou membro.",
});
export type OrgMemberRole = z.infer<typeof OrgMemberRole>;
export const ORG_MEMBER_ROLE_LABELS: Record<OrgMemberRole, string> = {
  owner: "Dono",
  member: "Membro",
};

/** GET /api/admin/orgs/:orgId/members */
export interface OrgMember {
  userId: string;
  name: string;
  email: string;
  role: OrgMemberRole;
  since: string;
}

/** PATCH /api/admin/orgs/:orgId/members/:userId */
export const OrgMemberUpdate = z.object({ role: OrgMemberRole });
export type OrgMemberUpdate = z.infer<typeof OrgMemberUpdate>;

/** POST /api/admin/orgs/:orgId/invites (equipe da organização) */
export const OrgInviteInput = z.object({ email: Email, role: OrgMemberRole.default("member") });
export type OrgInviteInput = z.infer<typeof OrgInviteInput>;

/** POST /api/admin/orgs/:orgId/events/:eventId/hosts (anfitrião do evento) */
export const HostInviteInput = z.object({ email: Email });
export type HostInviteInput = z.infer<typeof HostInviteInput>;

export type TeamInviteStatus = "pending" | "accepted" | "revoked" | "expired";

/** Convite listado no painel (nunca traz o token). */
export interface TeamInvite {
  id: number;
  email: string;
  role: "owner" | "member" | "host";
  eventId: number | null;
  eventName: string | null;
  status: TeamInviteStatus;
  invitedBy: string | null;
  expiresAt: string;
  createdAt: string;
}

/** GET /api/admin/orgs/:orgId/events/:eventId/hosts */
export interface EventHostRow {
  userId: string;
  name: string;
  email: string;
  since: string;
}

/** GET /api/team-invites/:token (público, sem sessão) */
export interface TeamInvitePreview {
  organizationName: string;
  eventName: string | null;
  role: "owner" | "member" | "host";
  /** E-mail do convite, mascarado se quem abre não está logado com ele ("an***@exemplo.com"). */
  email: string;
  /** Já existe conta com esse e-mail: o aceite pede login em vez de criar senha. */
  accountExists: boolean;
  expiresAt: string;
}

/**
 * POST /api/team-invites/:token/accept. Sem conta: `name` + `password` criam a conta (o
 * painel faz login em seguida). Com conta: precisa estar logado com o e-mail do convite e o
 * corpo pode vir vazio.
 */
export const AcceptTeamInvite = z.object({
  name: z.string().trim().min(1, { error: "Informe seu nome." }).max(191).optional(),
  password: z
    .string()
    .min(PASSWORD_MIN, { error: `A senha precisa de pelo menos ${PASSWORD_MIN} caracteres.` })
    .max(PASSWORD_MAX)
    .optional(),
});
export type AcceptTeamInvite = z.infer<typeof AcceptTeamInvite>;

export interface AcceptTeamInviteResult {
  /** Conta criada agora (o painel faz login com o e-mail do convite e a senha digitada). */
  created: boolean;
  email: string;
  organizationId: number;
  eventId: number | null;
}
