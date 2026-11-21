import { eq } from "drizzle-orm";
import type { Database } from "./client.ts";
import { COURTESY_PLAN_CODE, organizationSubscriptions, plans } from "./schema/platform.ts";

/*
 * Fase 6 (docs/saas/fase-6.md): catálogo de planos da plataforma, gravado pelo seed/setup
 * (só os que faltam, por `code`: não mexe em preço/limite que o platform admin já editou).
 * Preços: TODO(conteudo) — o usuário define depois (decisão de 21/11/2026). Limites e taxa são
 * o ponto de partida; a frente A pode ajustar. "cortesia" também nasce na migration 0012.
 */

export interface PlanSeed {
  code: string;
  name: string;
  description: string;
  public: boolean;
  priceMonthlyCents: number | null;
  priceYearlyCents: number | null;
  trialDays: number;
  feeBps: number;
  limits: {
    activeEvents: number | null;
    guestsPerEvent: number | null;
    members: number | null;
    storageMb: number | null;
    modules: string[] | null;
  };
  sort: number;
}

const UNLIMITED: PlanSeed["limits"] = {
  activeEvents: null,
  guestsPerEvent: null,
  members: null,
  storageMb: null,
  modules: null,
};

export const PLAN_CATALOG: readonly PlanSeed[] = [
  {
    // TODO(conteudo): nome, descrição, preço e limites do plano de entrada.
    code: "essencial",
    name: "Essencial",
    description: "Para um evento: site, confirmação de presença e lista de presentes.",
    public: true,
    priceMonthlyCents: null,
    priceYearlyCents: null,
    trialDays: 14,
    feeBps: 50,
    limits: { activeEvents: 1, guestsPerEvent: 300, members: 2, storageMb: 500, modules: null },
    sort: 10,
  },
  {
    // TODO(conteudo): nome, descrição, preço e limites do plano para cerimonialistas.
    code: "profissional",
    name: "Profissional",
    description: "Para quem organiza vários eventos: equipe, gestão e domínio próprio.",
    public: true,
    priceMonthlyCents: null,
    priceYearlyCents: null,
    trialDays: 14,
    feeBps: 50,
    limits: {
      activeEvents: 10,
      guestsPerEvent: 1000,
      members: 10,
      storageMb: 5000,
      modules: null,
    },
    sort: 20,
  },
  {
    code: COURTESY_PLAN_CODE,
    name: "Cortesia",
    description: "Plano interno da plataforma: sem limites, sem cobrança e sem taxa.",
    public: false,
    priceMonthlyCents: null,
    priceYearlyCents: null,
    trialDays: 0,
    feeBps: 0,
    limits: UNLIMITED,
    sort: 100,
  },
];

/** Plano padrão do cadastro self-service (com teste). */
export const DEFAULT_SIGNUP_PLAN_CODE = "essencial";

/** Grava os planos que faltam. Não sobrescreve os existentes. Devolve quantos criou. */
export async function ensurePlans(db: Database): Promise<number> {
  let created = 0;
  for (const p of PLAN_CATALOG) {
    const [res] = await db
      .insert(plans)
      .ignore()
      .values({ ...p, active: true });
    created += res.affectedRows;
  }
  return created;
}

/**
 * Garante uma assinatura para a organização (sem cobrança: `internal` para plano interno, senão
 * `trialing` até a frente A ligar o provedor). Não troca o plano de quem já tem. true = criou.
 */
export async function ensureOrgSubscription(
  db: Database,
  organizationId: number,
  planCode: string,
): Promise<boolean> {
  const [plan] = await db
    .select({ id: plans.id, trialDays: plans.trialDays })
    .from(plans)
    .where(eq(plans.code, planCode));
  if (!plan) throw new Error(`Plano inexistente: ${planCode}`);
  const internal = planCode === COURTESY_PLAN_CODE;
  const [res] = await db
    .insert(organizationSubscriptions)
    .ignore()
    .values({
      organizationId,
      planId: plan.id,
      status: internal ? "internal" : "trialing",
      trialEndsAt: internal ? null : new Date(Date.now() + plan.trialDays * 86_400_000),
    });
  return res.affectedRows === 1;
}
