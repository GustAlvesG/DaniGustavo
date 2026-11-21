import {
  and,
  asc,
  count,
  eq,
  eventMembers,
  events,
  inArray,
  legalAcceptances,
  organizationMembers,
  organizationSubscriptions,
  organizations,
  paymentAccounts,
  user,
  type Database,
} from "@casamento/db";
import { DeleteAccountInput, type MyDataExport } from "@casamento/shared";
import { Hono } from "hono";
import { apiError, ERROR_CODES } from "../errors.ts";
import { crossEvent } from "../tenancy/cross-event.ts";
import { invalid, readJson, type AdminDeps, type AdminEnv } from "./context.ts";

const ROLE_LABEL: Record<string, string> = { owner: "dono", member: "membro", host: "anfitrião" };

/** Assinatura que ainda cobra (a organização sem dono continuaria pagando). */
const BILLING_STATUSES = ["trialing", "active", "past_due"] as const;

/**
 * Por que a pessoa não pode apagar a conta agora (null = pode). Regras de docs/saas/fase-6.md
 * §3: a organização nunca fica sem dono enquanto tiver evento, equipe ou assinatura; titular de
 * conta de recebimento não sai (os pedidos dependem dela).
 */
export async function accountDeletionBlocker(db: Database, userId: string): Promise<string | null> {
  const owned = await db
    .select({ orgId: organizationMembers.organizationId, name: organizations.name })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.role, "owner")));
  for (const org of owned) {
    const [owners] = await db
      .select({ n: count() })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, org.orgId),
          eq(organizationMembers.role, "owner"),
        ),
      );
    if ((owners?.n ?? 0) > 1) continue;
    const [[evs], [members], [subs]] = await Promise.all([
      db.select({ n: count() }).from(events).where(eq(events.organizationId, org.orgId)),
      db
        .select({ n: count() })
        .from(organizationMembers)
        .where(eq(organizationMembers.organizationId, org.orgId)),
      db
        .select({ n: count() })
        .from(organizationSubscriptions)
        .where(
          and(
            eq(organizationSubscriptions.organizationId, org.orgId),
            inArray(organizationSubscriptions.status, [...BILLING_STATUSES]),
          ),
        ),
    ]);
    if ((evs?.n ?? 0) > 0 || (members?.n ?? 0) > 1) {
      return `Você é o único dono de ${org.name}. Passe a posse para outra pessoa da equipe (ou apague os eventos) antes de apagar a conta.`;
    }
    if ((subs?.n ?? 0) > 0) {
      return `${org.name} tem uma assinatura em andamento. Cancele a assinatura antes de apagar a conta.`;
    }
  }
  // O builder só executa no await: ele precisa acontecer dentro do crossEvent.
  const [held] = await crossEvent(
    "conta: subcontas de recebimento da própria pessoa",
    async () =>
      await db
        .select({ n: count() })
        .from(paymentAccounts)
        .where(eq(paymentAccounts.userId, userId)),
  );
  if ((held?.n ?? 0) > 0) {
    return "Você é titular de uma conta de recebimento dos presentes. Fale com a organização para trocar o recebedor antes de apagar a conta.";
  }
  return null;
}

/*
 * Fase 6, frente C: dados da própria conta (LGPD), em /api/admin/me.
 *
 * - GET    /export  → MyDataExport (attachment)
 * - DELETE /        DeleteAccountInput → { ok } apaga a própria conta (sessões, vínculos e o
 *   usuário; os registros que apontam para ela ficam sem autor). Recusado (409) se for o único
 *   dono de uma organização com evento, equipe ou assinatura, ou titular de subconta.
 */
export function adminMeRoutes(deps: AdminDeps) {
  const { db, now } = deps;
  const app = new Hono<AdminEnv>();

  app.get("/export", async (c) => {
    const me = c.get("user");
    const [[row], orgs, evs, legal] = await Promise.all([
      db.select().from(user).where(eq(user.id, me.id)),
      db
        .select({ id: organizations.id, name: organizations.name, role: organizationMembers.role })
        .from(organizationMembers)
        .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
        .where(eq(organizationMembers.userId, me.id))
        .orderBy(asc(organizations.id)),
      db
        .select({ id: events.id, name: events.name, role: eventMembers.role })
        .from(eventMembers)
        .innerJoin(events, eq(events.id, eventMembers.eventId))
        .where(eq(eventMembers.userId, me.id))
        .orderBy(asc(events.id)),
      db
        .select({
          document: legalAcceptances.document,
          version: legalAcceptances.version,
          acceptedAt: legalAcceptances.acceptedAt,
        })
        .from(legalAcceptances)
        .where(eq(legalAcceptances.userId, me.id))
        .orderBy(asc(legalAcceptances.acceptedAt)),
    ]);
    const body: MyDataExport = {
      exportedAt: now().toISOString(),
      user: {
        id: me.id,
        name: row?.name ?? me.name,
        email: row?.email ?? me.email,
        createdAt: (row?.createdAt ?? now()).toISOString(),
      },
      organizations: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        role: ROLE_LABEL[o.role] ?? o.role,
      })),
      events: evs.map((e) => ({ id: e.id, name: e.name, role: ROLE_LABEL[e.role] ?? e.role })),
      legalAcceptances: legal.map((l) => ({
        document: l.document,
        version: l.version,
        acceptedAt: l.acceptedAt.toISOString(),
      })),
    };
    return c.body(JSON.stringify(body, null, 2), 200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="meus-dados.json"',
    });
  });

  app.delete("/", async (c) => {
    const me = c.get("user");
    const parsed = DeleteAccountInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    if (parsed.data.confirmEmail !== me.email.trim().toLowerCase()) {
      return c.json(
        {
          error: {
            code: ERROR_CODES.invalidRequest,
            message: "Para confirmar, digite exatamente o e-mail da sua conta.",
            field: "confirmEmail",
          },
        },
        422,
      );
    }
    const blocker = await accountDeletionBlocker(db, me.id);
    if (blocker) return apiError(c, 409, ERROR_CODES.conflict, blocker);
    // Sessões, contas de login, vínculos e aceites saem em cascata; autoria vira nula.
    await db.delete(user).where(eq(user.id, me.id));
    return c.json({ ok: true });
  });

  return app;
}
