import {
  eq,
  inArray,
  organizationSubscriptions,
  organizationUsage,
  plans,
  type Database,
} from "@casamento/db";
import type { PlanLimits, SubscriptionStatus } from "@casamento/shared";

/*
 * Fase 6, frente A: planos e assinaturas de teste. Cada arquivo cria os próprios planos (código
 * com o sufixo da rodada: os arquivos rodam em paralelo no mesmo banco) e grava a assinatura
 * direto na tabela. A assinatura sai em cascata com a organização (cleanup da fixture); os planos,
 * em `dropPlans`, depois.
 */

const NO_LIMITS: PlanLimits = {
  activeEvents: null,
  guestsPerEvent: null,
  members: null,
  storageMb: null,
  modules: null,
};

export interface TestPlanInput {
  code: string;
  limits?: Partial<PlanLimits>;
  feeBps?: number;
  priceMonthlyCents?: number | null;
  priceYearlyCents?: number | null;
  trialDays?: number;
  public?: boolean;
}

export async function createPlan(db: Database, input: TestPlanInput) {
  await db.insert(plans).values({
    code: input.code,
    name: `Plano ${input.code}`,
    description: "Plano de teste",
    public: input.public ?? true,
    active: true,
    priceMonthlyCents: input.priceMonthlyCents === undefined ? 4990 : input.priceMonthlyCents,
    priceYearlyCents: input.priceYearlyCents === undefined ? 49900 : input.priceYearlyCents,
    trialDays: input.trialDays ?? 0,
    feeBps: input.feeBps ?? 50,
    limits: { ...NO_LIMITS, ...input.limits },
    sort: 9000,
  });
  const [row] = await db.select().from(plans).where(eq(plans.code, input.code));
  return row!;
}

export async function planId(db: Database, code: string): Promise<number> {
  const [row] = await db.select({ id: plans.id }).from(plans).where(eq(plans.code, code));
  return row!.id;
}

/** Grava (ou troca) a assinatura da organização. */
export async function setSubscription(
  db: Database,
  organizationId: number,
  planCode: string,
  over: Partial<typeof organizationSubscriptions.$inferInsert> & {
    status?: SubscriptionStatus;
  } = {},
) {
  const values = {
    planId: await planId(db, planCode),
    status: "active" as SubscriptionStatus,
    billingCycle: "monthly" as const,
    provider: null,
    providerCustomerId: null,
    providerSubscriptionId: null,
    trialEndsAt: null,
    currentPeriodEndsAt: null,
    pastDueSince: null,
    canceledAt: null,
    feeBpsOverride: null,
    ...over,
  };
  await db
    .insert(organizationSubscriptions)
    .values({ organizationId, ...values })
    .onDuplicateKeyUpdate({ set: values });
}

export async function clearSubscription(db: Database, organizationId: number) {
  await db
    .delete(organizationSubscriptions)
    .where(eq(organizationSubscriptions.organizationId, organizationId));
  await db.delete(organizationUsage).where(eq(organizationUsage.organizationId, organizationId));
}

/** Apaga os planos de teste (depois do cleanup das organizações, que leva as assinaturas). */
export async function dropPlans(db: Database, codes: string[]) {
  if (codes.length) await db.delete(plans).where(inArray(plans.code, codes));
}

export const DAY = 86_400_000;
