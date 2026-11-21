import {
  and,
  eq,
  inArray,
  organizationMembers,
  organizations,
  organizationSubscriptions,
  subscriptionPayments,
  user,
  webhookEvents,
  type Database,
} from "@casamento/db";
import type {
  BillingCycle,
  SubscriptionChangeInput,
  SubscriptionChangeResult,
  SubscriptionStatus,
  SubscriptionView,
} from "@casamento/shared";
import {
  addCycle,
  isoDay,
  SubscriptionProviderError,
  type SubscriptionPaymentSnapshot,
  type SubscriptionProvider,
  type SubscriptionWebhookNotice,
} from "../billing/index.ts";
import { billingLive, type Env } from "../env.ts";
import type { Mailer } from "../mailer.ts";
import {
  buildSubscriptionEmail,
  subscriptionLink,
  type SubscriptionEmailKind,
} from "../subscription-email.ts";
import { crossEvent } from "../tenancy/cross-event.ts";
import { PlanLimitError } from "./limits.ts";
import {
  computeUsage,
  findPlan,
  firstExceeded,
  isInternalPlan,
  loadSubscription,
  modulesInUse,
  overdueSince,
  parseLimits,
  subscriptionView,
  type OrgSubscription,
  type PlanRow,
  type SubscriptionRow,
} from "./service.ts";

/*
 * Fase 6, frente A (docs/saas/fase-6.md §3): escolher/trocar/cancelar o plano, sincronizar as
 * cobranças com o provedor (webhook, rotina, troca) e a máquina de estados da assinatura:
 *
 *   trialing ──(pagou)──▶ active ──(cobrança vencida)──▶ past_due ──(pagou)──▶ active
 *       └──(teste acabou sem pagamento)──▶ past_due          (carência → painel só leitura)
 *   qualquer ──(dono cancela)──▶ canceled (vale até o fim do período; depois só leitura)
 *   internal = plano interno (Cortesia), sem cobrança nem limite.
 */

export interface SubscriptionDeps {
  env: Env;
  db: Database;
  billing: SubscriptionProvider;
  mailer: Mailer;
  now: () => Date;
}

/** Erro de regra da assinatura (a rota responde com o status e a mensagem). */
export class SubscriptionError extends Error {
  readonly status: 404 | 409 | 422;
  readonly field?: string;
  constructor(status: SubscriptionError["status"], message: string, field?: string) {
    super(message);
    this.name = "SubscriptionError";
    this.status = status;
    this.field = field;
  }
}

const DAY = 86_400_000;

const priceFor = (plan: PlanRow, cycle: BillingCycle) =>
  cycle === "yearly" ? plan.priceYearlyCents : plan.priceMonthlyCents;

/* ------------------------------------------------------------------------ */
/* Cobranças: provedor → banco                                               */
/* ------------------------------------------------------------------------ */

async function upsertPayments(
  db: Database,
  sub: SubscriptionRow,
  list: SubscriptionPaymentSnapshot[],
  now: Date,
): Promise<void> {
  for (const p of list) {
    const values = {
      status: p.status,
      amountCents: p.amountCents,
      dueOn: p.dueOn,
      paidAt: p.paidAt,
      invoiceUrl: p.invoiceUrl,
    };
    await db
      .insert(subscriptionPayments)
      .values({
        ...values,
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        providerPaymentId: p.providerPaymentId,
      })
      .onDuplicateKeyUpdate({ set: { ...values, updatedAt: now } });
  }
}

/** Próximo estado da assinatura a partir das cobranças (a verdade vem do provedor). */
export function nextState(
  sub: SubscriptionRow,
  list: SubscriptionPaymentSnapshot[],
  now: Date,
): Partial<SubscriptionRow> {
  if (sub.status === "internal" || sub.status === "canceled") return {};
  const overdue = list.filter((p) => p.status === "overdue").sort(byDue);
  if (overdue.length > 0) {
    const since = sub.pastDueSince ?? new Date(`${overdue[0]!.dueOn}T15:00:00Z`);
    return sub.status === "past_due" && sub.pastDueSince
      ? {}
      : { status: "past_due", pastDueSince: since < now ? since : now };
  }
  const paid = list.filter((p) => p.status === "paid").sort(byDue);
  const last = paid.at(-1);
  if (last && sub.billingCycle) {
    const periodEnd = addCycle(last.dueOn, sub.billingCycle);
    const changed: Partial<SubscriptionRow> = {};
    if (sub.status !== "active") changed.status = "active";
    if (sub.pastDueSince) changed.pastDueSince = null;
    if (sub.currentPeriodEndsAt?.getTime() !== periodEnd.getTime()) {
      changed.currentPeriodEndsAt = periodEnd;
    }
    return changed;
  }
  return {};
}

const byDue = (a: { dueOn: string }, b: { dueOn: string }) => a.dueOn.localeCompare(b.dueOn);

/** Fatura em aberto mais antiga (onde pagar agora), ou null. */
async function openInvoice(db: Database, organizationId: number): Promise<string | null> {
  const rows = await db
    .select({
      status: subscriptionPayments.status,
      dueOn: subscriptionPayments.dueOn,
      invoiceUrl: subscriptionPayments.invoiceUrl,
    })
    .from(subscriptionPayments)
    .where(
      and(
        eq(subscriptionPayments.organizationId, organizationId),
        inArray(subscriptionPayments.status, ["pending", "overdue"]),
      ),
    );
  return rows.sort(byDue).find((r) => r.invoiceUrl)?.invoiceUrl ?? null;
}

async function ownerEmails(db: Database, organizationId: number): Promise<string[]> {
  const rows = await db
    .select({ email: user.email })
    .from(organizationMembers)
    .innerJoin(user, eq(user.id, organizationMembers.userId))
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.role, "owner"),
      ),
    );
  return rows.map((r) => r.email);
}

/** Avisa os donos da organização (falha de e-mail vai para o log, não derruba a rotina). */
export async function notifyOwners(
  deps: SubscriptionDeps,
  current: OrgSubscription,
  kind: SubscriptionEmailKind,
): Promise<void> {
  const { db } = deps;
  const orgId = current.sub.organizationId;
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const [to, invoiceUrl] = await Promise.all([ownerEmails(db, orgId), openInvoice(db, orgId)]);
  for (const email of to) {
    try {
      await deps.mailer.send(
        buildSubscriptionEmail({
          to: email,
          organizationName: org?.name ?? "Sua organização",
          planName: current.plan.name,
          kind,
          invoiceUrl,
          link: subscriptionLink(deps.env.BETTER_AUTH_URL, orgId),
        }),
      );
    } catch (err) {
      console.error(`[assinaturas] Falha ao avisar a organização ${orgId}:`, err);
    }
  }
}

/**
 * Busca as cobranças no provedor, grava e aplica a mudança de estado. Assinatura sem
 * `provider_subscription_id` (ou de outro provedor) não é consultada. Devolve o estado novo.
 */
export async function syncSubscription(
  deps: SubscriptionDeps,
  current: OrgSubscription,
): Promise<OrgSubscription> {
  const { db, billing } = deps;
  const { sub } = current;
  if (!sub.providerSubscriptionId || sub.provider !== billing.name) return current;
  const now = deps.now();
  const list = await billing.listPayments(sub.providerSubscriptionId);
  await upsertPayments(db, sub, list, now);
  const changed = nextState(sub, list, now);
  if (Object.keys(changed).length === 0) return current;
  await db
    .update(organizationSubscriptions)
    .set({ ...changed, updatedAt: now })
    .where(eq(organizationSubscriptions.organizationId, sub.organizationId));
  const fresh = { sub: { ...sub, ...changed }, plan: current.plan };
  if (changed.status === "past_due") await notifyOwners(deps, fresh, "past_due");
  if (changed.status === "active" && sub.status === "past_due") {
    await notifyOwners(deps, fresh, "paid");
  }
  return fresh;
}

/* ------------------------------------------------------------------------ */
/* Dono: escolher, trocar e cancelar                                         */
/* ------------------------------------------------------------------------ */

export interface ChangeActor {
  org: { id: number; name: string };
  /** Quem paga (e-mail do cliente no provedor): o dono que fez a troca. */
  payer: { name: string; email: string };
}

/**
 * Escolhe/troca o plano (dono). Plano interno, inativo ou sem preço no ciclo → 422; uso atual
 * maior que um limite do plano novo → 409 `plan_limit` (`PlanLimitError`). Com teste em curso,
 * a primeira cobrança fica para o fim do teste; em atraso, continua em atraso até pagar (trocar
 * de plano não tira o painel do modo só leitura).
 */
export async function changePlan(
  deps: SubscriptionDeps,
  actor: ChangeActor,
  input: SubscriptionChangeInput,
): Promise<SubscriptionChangeResult> {
  const { db, billing } = deps;
  const now = deps.now();
  const plan = await findPlan(db, input.planCode);
  if (!plan || !plan.active || isInternalPlan(plan)) {
    throw new SubscriptionError(
      422,
      "Plano indisponível. Escolha um dos planos da lista.",
      "planCode",
    );
  }
  const price = priceFor(plan, input.billingCycle);
  if (price === null) {
    throw new SubscriptionError(
      422,
      input.billingCycle === "yearly"
        ? "Este plano ainda não tem preço anual. Escolha o mensal ou fale com a gente."
        : "Este plano ainda não tem preço definido. Fale com a gente para contratar.",
      "billingCycle",
    );
  }
  const [usage, inUse] = await Promise.all([
    computeUsage(db, actor.org.id),
    modulesInUse(db, actor.org.id),
  ]);
  const exceeded = firstExceeded(parseLimits(plan.limits), usage, inUse);
  if (exceeded) throw new PlanLimitError({ ok: false, ...exceeded });

  const current = await loadSubscription(db, actor.org.id);
  const sub = current?.sub ?? null;
  const ours = sub?.provider === billing.name;
  const liveRemote =
    sub?.providerSubscriptionId && ours && sub.status !== "canceled" && sub.status !== "internal"
      ? sub.providerSubscriptionId
      : null;

  // Mesmo plano e ciclo, já cobrando: nada a fazer (o botão pode ser clicado duas vezes).
  if (
    current &&
    liveRemote &&
    current.plan.id === plan.id &&
    sub!.billingCycle === input.billingCycle
  ) {
    return {
      subscription: await subscriptionView(db, current, now),
      invoiceUrl: await openInvoice(db, actor.org.id),
    };
  }

  // Teste: o que está em curso continua; organização sem assinatura (legado) ganha o do plano.
  const trialEndsAt =
    sub?.status === "trialing" && sub.trialEndsAt && sub.trialEndsAt > now
      ? sub.trialEndsAt
      : !sub && plan.trialDays > 0
        ? new Date(now.getTime() + plan.trialDays * DAY)
        : null;
  const overdue = sub ? overdueSince(sub, now) : null;
  const status: SubscriptionStatus = trialEndsAt ? "trialing" : overdue ? "past_due" : "active";

  let providerCustomerId = ours ? (sub?.providerCustomerId ?? null) : null;
  let providerSubscriptionId: string | null = null;
  // Cobrança simulada em produção: o plano muda, mas nada é cobrado (sem assinatura no provedor).
  if (price > 0 && billingLive(deps.env)) {
    providerCustomerId ??= (
      await billing.createCustomer({
        organizationId: actor.org.id,
        name: actor.org.name,
        email: actor.payer.email,
      })
    ).customerId;
    const snap = liveRemote
      ? await billing.updateSubscription(liveRemote, {
          valueCents: price,
          cycle: input.billingCycle,
          planName: plan.name,
        })
      : await billing.createSubscription({
          customerId: providerCustomerId,
          organizationId: actor.org.id,
          planName: plan.name,
          valueCents: price,
          cycle: input.billingCycle,
          nextDueDate: isoDay(trialEndsAt ?? now),
        });
    providerSubscriptionId = snap.providerSubscriptionId;
  } else if (liveRemote) {
    // Plano gratuito: a assinatura paga no provedor deixa de existir.
    await billing.cancelSubscription(liveRemote);
  }

  const values = {
    planId: plan.id,
    status,
    billingCycle: input.billingCycle,
    provider: providerSubscriptionId ? billing.name : null,
    providerCustomerId,
    providerSubscriptionId,
    trialEndsAt: trialEndsAt ?? sub?.trialEndsAt ?? null,
    pastDueSince: status === "past_due" ? overdue : null,
    canceledAt: null,
    currentPeriodEndsAt: sub?.currentPeriodEndsAt ?? null,
    updatedAt: now,
  };
  if (sub) {
    await db
      .update(organizationSubscriptions)
      .set(values)
      .where(eq(organizationSubscriptions.organizationId, actor.org.id));
  } else {
    await db.insert(organizationSubscriptions).values({ ...values, organizationId: actor.org.id });
  }
  let fresh = (await loadSubscription(db, actor.org.id))!;
  fresh = await syncSubscription(deps, fresh);
  return {
    subscription: await subscriptionView(db, fresh, now),
    invoiceUrl: await openInvoice(db, actor.org.id),
  };
}

/** Cancela (dono): vale até o fim do período pago (ou do teste); depois, só leitura. */
export async function cancelPlan(
  deps: SubscriptionDeps,
  organizationId: number,
): Promise<SubscriptionView> {
  const { db, billing } = deps;
  const now = deps.now();
  const current = await loadSubscription(db, organizationId);
  if (!current) throw new SubscriptionError(404, "Esta organização não tem assinatura.");
  const { sub } = current;
  if (sub.status === "internal") {
    throw new SubscriptionError(422, "O plano interno não tem cobrança para cancelar.");
  }
  if (sub.status === "canceled") return subscriptionView(db, current, now);
  if (sub.providerSubscriptionId && sub.provider === billing.name) {
    await billing.cancelSubscription(sub.providerSubscriptionId);
  }
  const until =
    sub.status === "trialing" ? (sub.trialEndsAt ?? now) : (sub.currentPeriodEndsAt ?? now);
  const changed = { status: "canceled" as const, canceledAt: now, currentPeriodEndsAt: until };
  await db
    .update(organizationSubscriptions)
    .set({ ...changed, updatedAt: now })
    .where(eq(organizationSubscriptions.organizationId, organizationId));
  if (sub.providerSubscriptionId && sub.provider === billing.name) {
    const list = await billing.listPayments(sub.providerSubscriptionId);
    await upsertPayments(db, sub, list, now);
  }
  return subscriptionView(db, { sub: { ...sub, ...changed }, plan: current.plan }, now);
}

/* ------------------------------------------------------------------------ */
/* Platform admin: plano interno, troca sem cobrança e taxa negociada        */
/* ------------------------------------------------------------------------ */

/**
 * Atribui um plano pelo painel da plataforma (sem conferir limites: decisão do admin). Plano
 * interno → `internal` (a assinatura paga no provedor é cancelada); saindo do interno → teste
 * do plano (ou `active` sem teste), e a organização escolhe o ciclo e paga pela página do plano.
 */
export async function assignPlanAsAdmin(
  deps: SubscriptionDeps,
  organizationId: number,
  plan: PlanRow,
): Promise<void> {
  const { db, billing } = deps;
  const now = deps.now();
  const current = await loadSubscription(db, organizationId);
  const sub = current?.sub ?? null;
  const remote =
    sub?.providerSubscriptionId && sub.provider === billing.name && sub.status !== "canceled"
      ? sub.providerSubscriptionId
      : null;
  let values: Partial<typeof organizationSubscriptions.$inferInsert>;
  if (isInternalPlan(plan)) {
    if (remote) await billing.cancelSubscription(remote);
    values = {
      planId: plan.id,
      status: "internal",
      provider: null,
      providerSubscriptionId: null,
      billingCycle: null,
      trialEndsAt: null,
      pastDueSince: null,
      canceledAt: null,
      currentPeriodEndsAt: null,
    };
  } else if (!sub || sub.status === "internal" || sub.status === "canceled") {
    const trialEndsAt = plan.trialDays > 0 ? new Date(now.getTime() + plan.trialDays * DAY) : null;
    values = {
      planId: plan.id,
      status: trialEndsAt ? "trialing" : "active",
      trialEndsAt,
      pastDueSince: null,
      canceledAt: null,
      currentPeriodEndsAt: null,
      billingCycle: sub?.billingCycle ?? "monthly",
    };
  } else {
    const price = priceFor(plan, sub.billingCycle ?? "monthly");
    if (remote && price !== null && price > 0) {
      await billing.updateSubscription(remote, {
        valueCents: price,
        cycle: sub.billingCycle ?? "monthly",
        planName: plan.name,
      });
    }
    values = { planId: plan.id };
  }
  if (sub) {
    await db
      .update(organizationSubscriptions)
      .set({ ...values, updatedAt: now })
      .where(eq(organizationSubscriptions.organizationId, organizationId));
  } else {
    await db.insert(organizationSubscriptions).values({
      status: "active",
      ...values,
      planId: plan.id,
      organizationId,
    });
  }
}

/** Taxa negociada (null = a do plano). Organização sem assinatura → 404. */
export async function setFeeOverride(
  db: Database,
  organizationId: number,
  feeBpsOverride: number | null,
  now: Date,
): Promise<void> {
  const [res] = await db
    .update(organizationSubscriptions)
    .set({ feeBpsOverride, updatedAt: now })
    .where(eq(organizationSubscriptions.organizationId, organizationId));
  if (res.affectedRows === 0) {
    throw new SubscriptionError(404, "Esta organização não tem assinatura para negociar a taxa.");
  }
}

/* ------------------------------------------------------------------------ */
/* Webhook e rotina                                                          */
/* ------------------------------------------------------------------------ */

export type SubscriptionNoticeResult =
  | { ok: true; duplicate: true }
  | { ok: true; ignored: true }
  | { ok: true; organizationId: number; status: SubscriptionStatus };

/**
 * Aviso do webhook (token já conferido): idempotente por `webhook_events` (id prefixado:
 * o Asaas manda o mesmo evento para todos os webhooks da conta principal, inclusive o dos
 * pedidos), acha a assinatura pelo id no provedor e consulta as cobranças lá.
 */
export async function handleSubscriptionNotice(
  deps: SubscriptionDeps,
  notice: SubscriptionWebhookNotice,
  body: unknown,
): Promise<SubscriptionNoticeResult> {
  const { db } = deps;
  const key = `assinatura:${notice.eventId}`.slice(0, 128);
  await db
    .insert(webhookEvents)
    .ignore()
    .values({ gateway: `${deps.billing.name}-assinatura`, eventId: key, payload: body ?? {} });
  const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.eventId, key));
  if (event?.processedAt) return { ok: true, duplicate: true };

  const [found] = await crossEvent(
    "webhook da assinatura: organização pelo id no provedor",
    async () =>
      await db
        .select({ organizationId: organizationSubscriptions.organizationId })
        .from(organizationSubscriptions)
        .where(eq(organizationSubscriptions.providerSubscriptionId, notice.providerSubscriptionId)),
  );
  let result: SubscriptionNoticeResult = { ok: true, ignored: true };
  if (found) {
    const current = await loadSubscription(db, found.organizationId);
    if (current) {
      const fresh = await syncSubscription(deps, current);
      result = { ok: true, organizationId: found.organizationId, status: fresh.sub.status };
    }
  }
  await db
    .update(webhookEvents)
    .set({ processedAt: deps.now() })
    .where(eq(webhookEvents.eventId, key));
  return result;
}

export interface SubscriptionRoundResult {
  synced: number;
  trialsEnded: number;
  errors: number;
}

/**
 * Uma rodada da rotina: confere no provedor as assinaturas que cobram (pega vencimento sem
 * webhook) e passa para `past_due` o teste que acabou sem pagamento.
 */
export async function runSubscriptionRound(
  deps: SubscriptionDeps,
): Promise<SubscriptionRoundResult> {
  const { db } = deps;
  const now = deps.now();
  // Cobrança simulada em produção: sem conferência no provedor e sem fim de teste → atraso.
  if (!billingLive(deps.env)) return { synced: 0, trialsEnded: 0, errors: 0 };
  const rows = await crossEvent(
    "rotina das assinaturas",
    async () =>
      await db
        .select({ organizationId: organizationSubscriptions.organizationId })
        .from(organizationSubscriptions)
        .where(inArray(organizationSubscriptions.status, ["trialing", "active", "past_due"])),
  );
  const result: SubscriptionRoundResult = { synced: 0, trialsEnded: 0, errors: 0 };
  for (const { organizationId } of rows) {
    try {
      let current = await loadSubscription(db, organizationId);
      if (!current) continue;
      if (current.sub.providerSubscriptionId && current.sub.provider === deps.billing.name) {
        current = await syncSubscription(deps, current);
        result.synced += 1;
      }
      const { sub } = current;
      if (sub.status === "trialing" && sub.trialEndsAt && sub.trialEndsAt < now) {
        await db
          .update(organizationSubscriptions)
          .set({ status: "past_due", pastDueSince: sub.trialEndsAt, updatedAt: now })
          .where(eq(organizationSubscriptions.organizationId, organizationId));
        result.trialsEnded += 1;
        await notifyOwners(deps, current, "trial_ended");
      }
    } catch (err) {
      result.errors += 1;
      const msg = err instanceof SubscriptionProviderError ? err.message : err;
      console.error(`[assinaturas] Falha na organização ${organizationId}:`, msg);
    }
  }
  return result;
}
