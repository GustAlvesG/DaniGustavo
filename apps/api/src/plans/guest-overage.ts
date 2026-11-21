import {
  and,
  byEvent,
  count,
  eq,
  eventSettings,
  guests,
  organizationMembers,
  user,
  type Database,
} from "@casamento/db";
import type { GuestLimitStatus } from "@casamento/shared";
import { readSetting, writeSetting } from "../admin/event-settings.ts";
import type { Env } from "../env.ts";
import { buildGuestOverageEmail, dashboardLink } from "../guest-overage-email.ts";
import type { Mailer } from "../mailer.ts";
import { eventNotifyRecipients } from "../orders/notify.ts";
import type { EventCtx } from "../tenancy/types.ts";
import { loadSubscription, parseLimits } from "./service.ts";

/*
 * Fase 7, frente D (docs/saas/fase-7.md §3): acompanhantes contam no limite de convidados do
 * plano, mas o RSVP nunca é recusado. Depois de gravar um RSVP, o `routes/invitations.ts`
 * chama `notifyGuestOverage`: se o evento passou do limite e ainda não avisou este estouro,
 * manda e-mail à equipe (hosts e owners) e grava `event_settings` > `plan.guest_overage`
 * ({ notifiedAt, used, limit }, privada). Voltou ao limite: a marca some, e um novo estouro
 * avisa de novo. Nunca lança (falha vira log).
 */

const KEY = "plan.guest_overage";

/** Pessoas do evento e o limite do plano (null = sem assinatura, plano interno ou sem limite). */
export async function guestLimitState(
  ev: EventCtx,
  db: Database,
): Promise<{ used: number; limit: number | null }> {
  const [[row], current] = await Promise.all([
    db.select({ n: count() }).from(guests).where(byEvent(guests, ev)),
    loadSubscription(db, ev.orgId),
  ]);
  const used = Number(row?.n ?? 0);
  if (!current || current.sub.status === "internal") return { used, limit: null };
  return { used, limit: parseLimits(current.plan.limits).guestsPerEvent };
}

function notifiedAtOf(value: unknown): string | null {
  const at = (value as { notifiedAt?: unknown } | undefined)?.notifiedAt;
  return typeof at === "string" ? at : null;
}

/** GET /guest-limit. */
export async function guestLimitStatus(ev: EventCtx, db: Database): Promise<GuestLimitStatus> {
  const [{ used, limit }, saved] = await Promise.all([
    guestLimitState(ev, db),
    readSetting(ev, db, KEY),
  ]);
  return {
    used,
    limit,
    over: limit !== null && used > limit,
    notifiedAt: notifiedAtOf(saved),
  };
}

async function recipients(ev: EventCtx, db: Database): Promise<string[]> {
  const [team, owners] = await Promise.all([
    eventNotifyRecipients(ev, db),
    db
      .select({ email: user.email })
      .from(organizationMembers)
      .innerJoin(user, eq(user.id, organizationMembers.userId))
      .where(
        and(
          eq(organizationMembers.organizationId, ev.orgId),
          eq(organizationMembers.role, "owner"),
        ),
      ),
  ]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of [...team, ...owners.map((o) => o.email)]) {
    const key = email.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(email.trim());
    }
  }
  return out;
}

export async function notifyGuestOverage(
  ev: EventCtx,
  deps: { env: Pick<Env, "BETTER_AUTH_URL">; db: Database; mailer: Mailer; now?: () => Date },
): Promise<void> {
  try {
    const { db, mailer } = deps;
    const { used, limit } = await guestLimitState(ev, db);
    const saved = await readSetting(ev, db, KEY);
    if (limit === null || used <= limit) {
      // Voltou ao limite (ou plano sem limite): o próximo estouro avisa de novo.
      if (saved !== undefined) {
        await db
          .delete(eventSettings)
          .where(and(byEvent(eventSettings, ev), eq(eventSettings.key, KEY)));
      }
      return;
    }
    if (notifiedAtOf(saved)) return;

    const now = (deps.now ?? (() => new Date()))();
    // Grava antes de enviar: dois RSVPs seguidos não mandam dois e-mails.
    await writeSetting(ev, db, KEY, { notifiedAt: now.toISOString(), used, limit }, false);
    const link = dashboardLink(deps.env.BETTER_AUTH_URL, ev.id);
    const results = await Promise.allSettled(
      (await recipients(ev, db)).map((to) =>
        mailer.send(buildGuestOverageEmail({ to, eventName: ev.name, used, limit, link })),
      ),
    );
    for (const r of results) {
      if (r.status === "rejected") console.error("[avisos] Falha no aviso de limite:", r.reason);
    }
  } catch (err) {
    console.error("[avisos] Falha ao avaliar o limite de convidados:", err);
  }
}
