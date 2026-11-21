import {
  account,
  and,
  desc,
  eq,
  eventMembers,
  events,
  gt,
  isNull,
  isUniqueViolation,
  organizationMembers,
  organizations,
  teamInvites,
  user,
  type Database,
  type TeamInviteRole,
} from "@casamento/db";
import {
  TEAM_INVITE_TTL_DAYS,
  type AcceptTeamInvite,
  type AcceptTeamInviteResult,
  type TeamInvite,
  type TeamInvitePreview,
  type TeamInviteStatus,
} from "@casamento/shared";
import { hashPassword } from "better-auth/crypto";
import { ulid } from "ulid";
import type { Env } from "../env.ts";
import type { Mailer } from "../mailer.ts";
import { buildTeamInviteEmail, teamInviteLink } from "../team-invite-email.ts";
import { crossEvent } from "../tenancy/cross-event.ts";
import { hashInviteToken, isInviteTokenShape, maskEmail, newInviteToken } from "./token.ts";
import { assertPlanLimit } from "../plans/limits.ts";

/*
 * Convites da equipe da organização e de anfitrião de evento (Fase 3, docs/saas/fase-3.md).
 * O token só existe no e-mail; o banco guarda o SHA-256. Validade de 7 dias, uso único;
 * reenviar troca o token (o link antigo morre). Toda consulta de `team_invites` filtra por
 * `organization_id`, exceto a busca pelo token (crossEvent: o token é o que diz a org).
 */

/** Falha com status e mensagem pt-BR (a rota converte em resposta). */
export class TeamInviteError extends Error {
  readonly status: 401 | 403 | 404 | 409 | 422 | 502;
  constructor(status: TeamInviteError["status"], message: string) {
    super(message);
    this.status = status;
  }
}

/** A mesma resposta para token inválido, expirado, usado ou revogado (não revela qual). */
export const INVITE_NOT_FOUND =
  "Convite não encontrado ou fora da validade. Peça a quem convidou para enviar um novo.";

const DAY = 86_400_000;
export const inviteExpiry = (now: Date) => new Date(now.getTime() + TEAM_INVITE_TTL_DAYS * DAY);

export interface InviteDeps {
  db: Database;
  env: Pick<Env, "BETTER_AUTH_URL">;
  mailer: Mailer;
  now: () => Date;
}

interface InviteRowLike {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}

export function inviteStatus(row: InviteRowLike, now: Date): TeamInviteStatus {
  if (row.acceptedAt) return "accepted";
  if (row.revokedAt) return "revoked";
  return row.expiresAt.getTime() <= now.getTime() ? "expired" : "pending";
}

const inviteColumns = {
  id: teamInvites.id,
  organizationId: teamInvites.organizationId,
  eventId: teamInvites.eventId,
  email: teamInvites.email,
  role: teamInvites.role,
  expiresAt: teamInvites.expiresAt,
  acceptedAt: teamInvites.acceptedAt,
  revokedAt: teamInvites.revokedAt,
  createdAt: teamInvites.createdAt,
  eventName: events.name,
  invitedBy: user.name,
};

type InviteListRow = {
  id: number;
  email: string;
  role: TeamInviteRole;
  eventId: number | null;
  eventName: string | null;
  invitedBy: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

function toTeamInvite(row: InviteListRow, now: Date): TeamInvite {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    eventId: row.eventId,
    eventName: row.eventName,
    status: inviteStatus(row, now),
    invitedBy: row.invitedBy,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Convites ainda não aceitos nem cancelados da organização (pendentes e vencidos), do mais
 * novo ao mais antigo. Com `eventId`, só os de anfitrião daquele evento.
 */
export async function listInvites(
  db: Database,
  orgId: number,
  now: Date,
  eventId?: number,
): Promise<TeamInvite[]> {
  const rows = await db
    .select(inviteColumns)
    .from(teamInvites)
    .leftJoin(events, eq(events.id, teamInvites.eventId))
    .leftJoin(user, eq(user.id, teamInvites.invitedBy))
    .where(
      and(
        eq(teamInvites.organizationId, orgId),
        eventId === undefined ? undefined : eq(teamInvites.eventId, eventId),
        isNull(teamInvites.acceptedAt),
        isNull(teamInvites.revokedAt),
      ),
    )
    .orderBy(desc(teamInvites.createdAt), desc(teamInvites.id));
  return rows.map((r) => toTeamInvite(r, now));
}

async function getInvite(db: Database, orgId: number, inviteId: number, now: Date) {
  const [row] = await db
    .select(inviteColumns)
    .from(teamInvites)
    .leftJoin(events, eq(events.id, teamInvites.eventId))
    .leftJoin(user, eq(user.id, teamInvites.invitedBy))
    .where(and(eq(teamInvites.id, inviteId), eq(teamInvites.organizationId, orgId)));
  return row ? { row, invite: toTeamInvite(row, now) } : null;
}

async function userIdByEmail(db: Database, email: string): Promise<string | null> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return row?.id ?? null;
}

export interface InviteTarget {
  org: { id: number; name: string };
  /** Preenchido = convite de anfitrião deste evento (já conferido como da organização). */
  event: { id: number; name: string } | null;
  email: string;
  role: TeamInviteRole;
  inviter: { id: string; name: string };
}

async function sendInviteEmail(
  deps: InviteDeps,
  target: Omit<InviteTarget, "inviter"> & { inviterName: string | null },
  token: string,
) {
  try {
    await deps.mailer.send(
      buildTeamInviteEmail({
        to: target.email,
        link: teamInviteLink(deps.env.BETTER_AUTH_URL, token),
        organizationName: target.org.name,
        eventName: target.event?.name ?? null,
        role: target.role,
        inviterName: target.inviterName,
      }),
    );
  } catch (err) {
    console.error("[convite da equipe] falha ao enviar o e-mail:", err);
    throw new TeamInviteError(
      502,
      "O convite foi salvo, mas o e-mail não saiu. Tente reenviar em alguns minutos.",
    );
  }
}

/**
 * Cria o convite e manda o e-mail. Já existe convite em aberto para o mesmo e-mail e destino:
 * reaproveita a linha (novo token, nova validade, papel atualizado) em vez de duplicar.
 */
export async function createInvite(deps: InviteDeps, target: InviteTarget): Promise<TeamInvite> {
  const { db } = deps;
  const now = deps.now();
  const existingUser = await userIdByEmail(db, target.email);
  if (existingUser) {
    const [orgMember] = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, target.org.id),
          eq(organizationMembers.userId, existingUser),
        ),
      );
    if (orgMember) {
      throw new TeamInviteError(
        409,
        target.event
          ? "Essa pessoa já faz parte da equipe da organização e já acessa o evento."
          : "Essa pessoa já faz parte da equipe. Para mudar o papel, use a lista da equipe.",
      );
    }
    if (target.event) {
      const [host] = await db
        .select({ id: eventMembers.id })
        .from(eventMembers)
        .where(
          and(eq(eventMembers.eventId, target.event.id), eq(eventMembers.userId, existingUser)),
        );
      if (host) throw new TeamInviteError(409, "Essa pessoa já é anfitriã deste evento.");
    }
  }

  const token = newInviteToken();
  const values = {
    role: target.role,
    tokenHash: hashInviteToken(token),
    invitedBy: target.inviter.id,
    expiresAt: inviteExpiry(now),
  };
  const [open] = await db
    .select({ id: teamInvites.id })
    .from(teamInvites)
    .where(
      and(
        eq(teamInvites.organizationId, target.org.id),
        eq(teamInvites.email, target.email),
        target.event ? eq(teamInvites.eventId, target.event.id) : isNull(teamInvites.eventId),
        isNull(teamInvites.acceptedAt),
        isNull(teamInvites.revokedAt),
      ),
    )
    .orderBy(desc(teamInvites.id))
    .limit(1);
  // Fase 6: vaga na equipe do plano (convite de anfitrião não conta; reenviar não soma).
  if (!target.event && !open) {
    await assertPlanLimit(db, target.org.id, { kind: "members", adding: 1 }, now);
  }
  let id: number;
  if (open) {
    id = open.id;
    await db
      .update(teamInvites)
      .set(values)
      .where(and(eq(teamInvites.id, id), eq(teamInvites.organizationId, target.org.id)));
  } else {
    const [res] = await db.insert(teamInvites).values({
      ...values,
      organizationId: target.org.id,
      eventId: target.event?.id ?? null,
      email: target.email,
    });
    id = res.insertId;
  }
  await sendInviteEmail(deps, { ...target, inviterName: target.inviter.name }, token);
  const saved = await getInvite(db, target.org.id, id, now);
  return saved!.invite;
}

/** Convite da organização por id, para reenviar/cancelar. Aceito ou cancelado → 409/404. */
export async function openInvite(db: Database, orgId: number, inviteId: number, now: Date) {
  const found = await getInvite(db, orgId, inviteId, now);
  if (!found || found.invite.status === "revoked") {
    throw new TeamInviteError(404, "Convite não encontrado.");
  }
  if (found.invite.status === "accepted") {
    throw new TeamInviteError(409, "Esse convite já foi aceito.");
  }
  return found;
}

/** Novo token e nova validade (o link anterior deixa de valer) e um novo e-mail. */
export async function resendInvite(
  deps: InviteDeps,
  org: { id: number; name: string },
  inviteId: number,
  inviter: { id: string; name: string },
): Promise<TeamInvite> {
  const now = deps.now();
  const { row } = await openInvite(deps.db, org.id, inviteId, now);
  const token = newInviteToken();
  await deps.db
    .update(teamInvites)
    .set({ tokenHash: hashInviteToken(token), expiresAt: inviteExpiry(now), invitedBy: inviter.id })
    .where(
      and(
        eq(teamInvites.id, inviteId),
        eq(teamInvites.organizationId, org.id),
        isNull(teamInvites.acceptedAt),
        isNull(teamInvites.revokedAt),
      ),
    );
  await sendInviteEmail(
    deps,
    {
      org,
      event: row.eventId && row.eventName ? { id: row.eventId, name: row.eventName } : null,
      email: row.email,
      role: row.role,
      inviterName: inviter.name,
    },
    token,
  );
  return (await getInvite(deps.db, org.id, inviteId, now))!.invite;
}

export async function revokeInvite(db: Database, orgId: number, inviteId: number, now: Date) {
  await openInvite(db, orgId, inviteId, now);
  await db
    .update(teamInvites)
    .set({ revokedAt: now })
    .where(
      and(
        eq(teamInvites.id, inviteId),
        eq(teamInvites.organizationId, orgId),
        isNull(teamInvites.acceptedAt),
      ),
    );
}

/* ------------------------------------------------------------------------------------------ */
/* Aceite (sem sessão obrigatória)                                                            */
/* ------------------------------------------------------------------------------------------ */

/** Convite válido pelo token (pendente e no prazo), com a organização e o evento; ou null. */
export async function findValidInvite(db: Database, token: string, now: Date) {
  if (!isInviteTokenShape(token)) return null;
  const [row] = await crossEvent(
    "convite da equipe por token",
    async () =>
      await db
        .select({
          id: teamInvites.id,
          organizationId: teamInvites.organizationId,
          organizationName: organizations.name,
          eventId: teamInvites.eventId,
          eventName: events.name,
          eventOrgId: events.organizationId,
          email: teamInvites.email,
          role: teamInvites.role,
          expiresAt: teamInvites.expiresAt,
          acceptedAt: teamInvites.acceptedAt,
          revokedAt: teamInvites.revokedAt,
        })
        .from(teamInvites)
        .innerJoin(organizations, eq(organizations.id, teamInvites.organizationId))
        .leftJoin(events, eq(events.id, teamInvites.eventId))
        .where(eq(teamInvites.tokenHash, hashInviteToken(token))),
  );
  if (!row || inviteStatus(row, now) !== "pending") return null;
  // Convite de anfitrião: o evento precisa existir e ser da organização do convite.
  if (row.eventId !== null && row.eventOrgId !== row.organizationId) return null;
  return row;
}

export async function previewInvite(
  db: Database,
  token: string,
  now: Date,
  sessionEmail: string | null,
): Promise<TeamInvitePreview | null> {
  const invite = await findValidInvite(db, token, now);
  if (!invite) return null;
  const accountExists = (await userIdByEmail(db, invite.email)) !== null;
  return {
    organizationName: invite.organizationName,
    eventName: invite.eventId !== null ? invite.eventName : null,
    role: invite.role,
    email: sessionEmail?.toLowerCase() === invite.email ? invite.email : maskEmail(invite.email),
    accountExists,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

/**
 * Aceita o convite. Sem conta com o e-mail do convite: cria `user` + `account` "credential"
 * (como `addUser` da CLI; e-mail verificado, já que o link chegou nele). Com conta: exige
 * sessão com o mesmo e-mail. Tudo numa transação; o UPDATE condicional garante o uso único
 * mesmo com dois cliques simultâneos.
 */
export async function acceptInvite(
  db: Database,
  token: string,
  input: AcceptTeamInvite,
  session: { userId: string; email: string } | null,
  now: Date,
): Promise<AcceptTeamInviteResult> {
  const invite = await findValidInvite(db, token, now);
  if (!invite) throw new TeamInviteError(404, INVITE_NOT_FOUND);
  const existingId = await userIdByEmail(db, invite.email);

  let userId: string;
  let created = false;
  let passwordHash: string | null = null;
  if (existingId) {
    if (!session) {
      throw new TeamInviteError(
        401,
        "Já existe uma conta com o e-mail do convite. Entre com ela para aceitar.",
      );
    }
    if (session.email.toLowerCase() !== invite.email || session.userId !== existingId) {
      throw new TeamInviteError(
        403,
        "Este convite é para outro e-mail. Saia da conta atual e entre com o e-mail que recebeu o convite.",
      );
    }
    userId = existingId;
  } else {
    if (!input.name || !input.password) {
      throw new TeamInviteError(422, "Informe seu nome e uma senha para criar a conta.");
    }
    userId = ulid();
    created = true;
    passwordHash = await hashPassword(input.password);
  }

  // Fase 6: entrar na equipe ocupa uma vaga do plano (quem já é da equipe não soma).
  if (invite.role !== "host") {
    const [already] = existingId
      ? await db
          .select({ role: organizationMembers.role })
          .from(organizationMembers)
          .where(
            and(
              eq(organizationMembers.organizationId, invite.organizationId),
              eq(organizationMembers.userId, existingId),
            ),
          )
      : [];
    if (!already) {
      await assertPlanLimit(
        db,
        invite.organizationId,
        { kind: "members", adding: 1, includePending: false },
        now,
      );
    }
  }

  try {
    await db.transaction(async (tx) => {
      if (created) {
        await tx.insert(user).values({
          id: userId,
          name: input.name!,
          email: invite.email,
          emailVerified: true,
        });
        await tx.insert(account).values({
          id: ulid(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: passwordHash,
        });
      }
      const [res] = await tx
        .update(teamInvites)
        .set({ acceptedAt: now, acceptedBy: userId })
        .where(
          and(
            eq(teamInvites.id, invite.id),
            eq(teamInvites.organizationId, invite.organizationId),
            isNull(teamInvites.acceptedAt),
            isNull(teamInvites.revokedAt),
            gt(teamInvites.expiresAt, now),
          ),
        );
      if (res.affectedRows !== 1) throw new TeamInviteError(404, INVITE_NOT_FOUND);

      if (invite.role === "host") {
        await tx
          .insert(eventMembers)
          .ignore()
          .values({ eventId: invite.eventId!, userId, role: "host" });
      } else {
        const where = and(
          eq(organizationMembers.organizationId, invite.organizationId),
          eq(organizationMembers.userId, userId),
        );
        const [member] = await tx
          .select({ role: organizationMembers.role })
          .from(organizationMembers)
          .where(where);
        if (!member) {
          await tx
            .insert(organizationMembers)
            .values({ organizationId: invite.organizationId, userId, role: invite.role });
        } else if (invite.role === "owner" && member.role !== "owner") {
          // Nunca rebaixa quem já é dono; convite de dono promove.
          await tx.update(organizationMembers).set({ role: "owner" }).where(where);
        }
      }
    });
  } catch (err) {
    // Duas criações de conta com o mesmo e-mail ao mesmo tempo: a segunda cai aqui.
    if (created && isUniqueViolation(err)) {
      throw new TeamInviteError(409, "Já existe uma conta com este e-mail. Entre com ela.");
    }
    throw err;
  }

  return {
    created,
    email: invite.email,
    organizationId: invite.organizationId,
    eventId: invite.role === "host" ? invite.eventId : null,
  };
}
