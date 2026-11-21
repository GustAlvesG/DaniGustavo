import {
  and,
  count,
  desc,
  eq,
  events,
  eventSettings,
  guests,
  inArray,
  organizationMembers,
  organizations,
  organizationSubscriptions,
  organizationUsage,
  plans,
  subscriptionPayments,
  type Database,
} from "@casamento/db";
import {
  COURTESY_PLAN_CODE,
  modulesFor,
  PAST_DUE_GRACE_DAYS,
  PlanLimits,
  type EventModulesInput,
  type LimitKind,
  type ModuleId,
  type PlanView,
  type SubscriptionPaymentView,
  type SubscriptionView,
  type UsageView,
} from "@casamento/shared";

/*
 * Fase 6, frente A (docs/saas/fase-6.md §3): leitura da assinatura, do plano e do uso de uma
 * organização. Tudo aqui filtra por `organization_id` (auditor estrito); leituras entre
 * organizações (painel da plataforma, rotinas, webhook) ficam com quem chama, em crossEvent.
 */

export type PlanRow = typeof plans.$inferSelect;
export type SubscriptionRow = typeof organizationSubscriptions.$inferSelect;
export type SubscriptionPaymentRow = typeof subscriptionPayments.$inferSelect;

const DAY = 86_400_000;
const MB = 1024 * 1024;

/** `plans.limits` (JSON) → PlanLimits; JSON estragado vira "sem limite" (nada some por erro). */
export function parseLimits(raw: unknown): PlanLimits {
  const parsed = PlanLimits.safeParse(raw ?? {});
  return parsed.success ? parsed.data : PlanLimits.parse({});
}

export function planView(row: PlanRow): PlanView {
  return {
    code: row.code,
    name: row.name,
    description: row.description,
    public: row.public,
    priceMonthlyCents: row.priceMonthlyCents,
    priceYearlyCents: row.priceYearlyCents,
    trialDays: row.trialDays,
    feeBps: row.feeBps,
    limits: parseLimits(row.limits),
  };
}

/** Plano interno (Cortesia ou outro não público): só o platform admin atribui; sem cobrança. */
export const isInternalPlan = (plan: Pick<PlanRow, "code" | "public">) =>
  plan.code === COURTESY_PLAN_CODE || !plan.public;

export async function findPlan(db: Database, code: string): Promise<PlanRow | null> {
  const [row] = await db.select().from(plans).where(eq(plans.code, code));
  return row ?? null;
}

export interface OrgSubscription {
  sub: SubscriptionRow;
  plan: PlanRow;
}

/** Assinatura da organização com o plano; null = organização sem assinatura (legado). */
export async function loadSubscription(
  db: Database,
  organizationId: number,
): Promise<OrgSubscription | null> {
  const [row] = await db
    .select({ sub: organizationSubscriptions, plan: plans })
    .from(organizationSubscriptions)
    .innerJoin(plans, eq(plans.id, organizationSubscriptions.planId))
    .where(eq(organizationSubscriptions.organizationId, organizationId));
  return row ?? null;
}

/** Taxa que vale para a organização: a negociada (override) ou a do plano. */
export const effectiveFeeBps = ({ sub, plan }: OrgSubscription) =>
  sub.feeBpsOverride ?? plan.feeBps;

/**
 * Desde quando a assinatura está em atraso (null = em dia). Teste vencido sem pagamento conta
 * como atraso desde o fim do teste, mesmo antes de a rotina gravar `past_due`.
 */
export function overdueSince(sub: SubscriptionRow, now: Date): Date | null {
  if (sub.status === "past_due") return sub.pastDueSince ?? sub.updatedAt;
  if (sub.status === "trialing" && sub.trialEndsAt && sub.trialEndsAt < now) {
    return sub.trialEndsAt;
  }
  return null;
}

/**
 * Painel só leitura? Atraso além da carência, ou cancelada depois do fim do período pago. O site
 * dos convidados nunca consulta isto.
 */
export function isReadOnly(sub: SubscriptionRow, now: Date): boolean {
  if (sub.status === "internal" || sub.status === "active") return false;
  if (sub.status === "canceled") {
    const until = sub.currentPeriodEndsAt ?? sub.trialEndsAt ?? sub.canceledAt;
    return !until || until < now;
  }
  const since = overdueSince(sub, now);
  return since !== null && now.getTime() - since.getTime() > PAST_DUE_GRACE_DAYS * DAY;
}

/* ------------------------------------------------------------------------ */
/* Uso                                                                       */
/* ------------------------------------------------------------------------ */

async function orgEventIds(db: Database, organizationId: number) {
  return db
    .select({ id: events.id, type: events.type, status: events.status })
    .from(events)
    .where(eq(events.organizationId, organizationId));
}

/** Convidados por evento da organização (só os eventos que têm algum). */
export async function guestCounts(db: Database, eventIds: number[]): Promise<Map<number, number>> {
  if (eventIds.length === 0) return new Map();
  const rows = await db
    .select({ eventId: guests.eventId, n: count() })
    .from(guests)
    .where(inArray(guests.eventId, eventIds))
    .groupBy(guests.eventId);
  return new Map(rows.map((r) => [r.eventId, Number(r.n)]));
}

export async function countMembers(db: Database, organizationId: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId));
  return Number(row?.n ?? 0);
}

export async function storageUsage(
  db: Database,
  organizationId: number,
): Promise<{ bytes: number; computedAt: Date | null }> {
  const [row] = await db
    .select({ bytes: organizationUsage.storageBytes, computedAt: organizationUsage.computedAt })
    .from(organizationUsage)
    .where(eq(organizationUsage.organizationId, organizationId));
  return { bytes: Number(row?.bytes ?? 0), computedAt: row?.computedAt ?? null };
}

/** Uso atual da organização (eventos, equipe e convidados contados na hora; espaço do cache). */
export async function computeUsage(db: Database, organizationId: number): Promise<UsageView> {
  const evs = await orgEventIds(db, organizationId);
  const [byEventGuests, members, storage] = await Promise.all([
    guestCounts(
      db,
      evs.map((e) => e.id),
    ),
    countMembers(db, organizationId),
    storageUsage(db, organizationId),
  ]);
  return {
    activeEvents: evs.filter((e) => e.status === "active").length,
    members,
    maxGuestsInEvent: Math.max(0, ...byEventGuests.values()),
    storageBytes: storage.bytes,
    storageComputedAt: storage.computedAt?.toISOString() ?? null,
  };
}

/** Módulos ligados em algum evento ativo ou rascunho da organização. */
export async function modulesInUse(db: Database, organizationId: number): Promise<Set<ModuleId>> {
  const evs = (await orgEventIds(db, organizationId)).filter((e) => e.status !== "archived");
  const used = new Set<ModuleId>();
  if (evs.length === 0) return used;
  const rows = await db
    .select({ eventId: eventSettings.eventId, value: eventSettings.value })
    .from(eventSettings)
    .where(
      and(
        inArray(
          eventSettings.eventId,
          evs.map((e) => e.id),
        ),
        eq(eventSettings.key, "event.modules"),
      ),
    );
  const stored = new Map(rows.map((r) => [r.eventId, r.value as EventModulesInput | null]));
  for (const e of evs) {
    const mods = modulesFor(e.type, stored.get(e.id) ?? null);
    for (const [id, on] of Object.entries(mods)) if (on) used.add(id as ModuleId);
  }
  return used;
}

/**
 * O uso cabe nos limites? Devolve o primeiro limite estourado (troca para plano menor → 409).
 * `modules` só é conferido quando `inUse` vem preenchido.
 */
export function firstExceeded(
  limits: PlanLimits,
  usage: UsageView,
  inUse?: Set<ModuleId>,
): { kind: LimitKind; limit: number | null } | null {
  const over = (limit: number | null, value: number) => limit !== null && value > limit;
  if (over(limits.activeEvents, usage.activeEvents)) {
    return { kind: "activeEvents", limit: limits.activeEvents };
  }
  if (over(limits.guestsPerEvent, usage.maxGuestsInEvent)) {
    return { kind: "guestsPerEvent", limit: limits.guestsPerEvent };
  }
  if (over(limits.members, usage.members)) return { kind: "members", limit: limits.members };
  if (limits.storageMb !== null && usage.storageBytes > limits.storageMb * MB) {
    return { kind: "storageMb", limit: limits.storageMb };
  }
  if (inUse && limits.modules !== null) {
    const allowed = new Set(limits.modules);
    if ([...inUse].some((m) => !allowed.has(m))) return { kind: "modules", limit: null };
  }
  return null;
}

/* ------------------------------------------------------------------------ */
/* Visão da assinatura                                                       */
/* ------------------------------------------------------------------------ */

export function paymentView(row: SubscriptionPaymentRow): SubscriptionPaymentView {
  return {
    id: row.id,
    status: row.status,
    amountCents: row.amountCents,
    dueOn: row.dueOn,
    paidAt: row.paidAt?.toISOString() ?? null,
    invoiceUrl: row.invoiceUrl,
  };
}

export async function listSubscriptionPayments(
  db: Database,
  organizationId: number,
  limit = 12,
): Promise<SubscriptionPaymentRow[]> {
  return db
    .select()
    .from(subscriptionPayments)
    .where(eq(subscriptionPayments.organizationId, organizationId))
    .orderBy(desc(subscriptionPayments.dueOn), desc(subscriptionPayments.id))
    .limit(limit);
}

export async function subscriptionView(
  db: Database,
  current: OrgSubscription,
  now: Date,
): Promise<SubscriptionView> {
  const { sub, plan } = current;
  const [usage, pays] = await Promise.all([
    computeUsage(db, sub.organizationId),
    listSubscriptionPayments(db, sub.organizationId),
  ]);
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return {
    plan: planView(plan),
    status: sub.status,
    billingCycle: sub.billingCycle,
    trialEndsAt: iso(sub.trialEndsAt),
    currentPeriodEndsAt: iso(sub.currentPeriodEndsAt),
    pastDueSince: iso(overdueSince(sub, now)),
    canceledAt: iso(sub.canceledAt),
    effectiveFeeBps: effectiveFeeBps(current),
    readOnly: isReadOnly(sub, now),
    usage,
    payments: pays.map(paymentView),
  };
}

/** Situação da organização para o gate: suspensa e/ou assinatura só leitura. */
export async function orgGateState(
  db: Database,
  organizationId: number,
  now: Date,
): Promise<{ suspended: boolean; readOnly: boolean }> {
  const [row] = await db
    .select({ status: organizations.status, sub: organizationSubscriptions })
    .from(organizations)
    .leftJoin(
      organizationSubscriptions,
      eq(organizationSubscriptions.organizationId, organizations.id),
    )
    .where(eq(organizations.id, organizationId));
  if (!row) return { suspended: false, readOnly: false };
  return {
    suspended: row.status === "suspended",
    readOnly: row.sub ? isReadOnly(row.sub, now) : false,
  };
}
