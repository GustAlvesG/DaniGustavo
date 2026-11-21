import { z } from "zod";
import { ModuleId } from "./modules.ts";

/*
 * Fase 6, frente A (docs/saas/fase-6.md): planos, assinaturas, limites e uso; painel do
 * platform admin. Rotas: `/api/admin/orgs/:orgId/{subscription,usage}`,
 * `/api/admin/platform/*` e o webhook `/api/webhooks/subscriptions`.
 */

/** Plano interno da organização 1 (casamento): sem limites, sem cobrança, taxa 0. */
export const COURTESY_PLAN_CODE = "cortesia";
/** Taxa padrão da plataforma sobre os presentes (0,5% sobre o líquido; decisão de 21/11/2026). */
export const DEFAULT_PLATFORM_FEE_BPS = 50;
/** Teto da taxa de um plano (o mesmo de PLATFORM_FEE_MAX_PERCENT, em bps). */
export const PLAN_FEE_MAX_BPS = 5000;
/**
 * Carência depois da primeira cobrança vencida: até aqui o painel só avisa; depois, o painel fica
 * só leitura (o site dos convidados NUNCA sai do ar por inadimplência). TODO(conteudo).
 */
export const PAST_DUE_GRACE_DAYS = 15;

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "internal",
] as const;
export const SubscriptionStatus = z.enum(SUBSCRIPTION_STATUSES);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;
export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: "Em teste",
  active: "Ativa",
  past_due: "Pagamento em atraso",
  canceled: "Cancelada",
  internal: "Interna (sem cobrança)",
};

export const BILLING_CYCLES = ["monthly", "yearly"] as const;
export const BillingCycle = z.enum(BILLING_CYCLES, { error: "Escolha mensal ou anual." });
export type BillingCycle = z.infer<typeof BillingCycle>;
export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: "Mensal",
  yearly: "Anual",
};

export const SUBSCRIPTION_PAYMENT_STATUSES = [
  "pending",
  "paid",
  "overdue",
  "refunded",
  "canceled",
] as const;
export type SubscriptionPaymentStatus = (typeof SUBSCRIPTION_PAYMENT_STATUSES)[number];

/** O que um plano limita (`plans.limits`). `null` em cada campo = sem limite. */
export const LIMIT_KINDS = [
  "activeEvents",
  "guestsPerEvent",
  "members",
  "storageMb",
  "modules",
] as const;
export type LimitKind = (typeof LIMIT_KINDS)[number];

const limitNumber = z.number().int().min(0).max(1_000_000).nullable();
export const PlanLimits = z.object({
  /** Eventos ativos ao mesmo tempo (rascunho e arquivado não contam). */
  activeEvents: limitNumber.default(null),
  /** Convidados (pessoas dos convites) por evento. */
  guestsPerEvent: limitNumber.default(null),
  /** Pessoas na equipe da organização (donos + membros; anfitriões não contam). */
  members: limitNumber.default(null),
  /** Espaço em disco de fotos, presentes e contratos, somando todos os eventos. */
  storageMb: limitNumber.default(null),
  /** Módulos que o plano permite ligar (null = todos). */
  modules: z.array(ModuleId).nullable().default(null),
});
export type PlanLimits = z.infer<typeof PlanLimits>;

export const LIMIT_LABELS: Record<LimitKind, string> = {
  activeEvents: "Eventos ativos",
  guestsPerEvent: "Convidados por evento",
  members: "Pessoas na equipe",
  storageMb: "Espaço para fotos e arquivos (MB)",
  modules: "Módulos do site",
};

/** Plano como aparece na página de preços e no painel. */
export interface PlanView {
  code: string;
  name: string;
  description: string | null;
  public: boolean;
  /** Centavos; null = preço ainda não definido (`TODO(conteudo)`) ou sob consulta. */
  priceMonthlyCents: number | null;
  priceYearlyCents: number | null;
  trialDays: number;
  feeBps: number;
  limits: PlanLimits;
}

/** Plano no painel da plataforma (GET /api/admin/platform/plans): inclui inativos e internos. */
export interface PlanAdminView extends PlanView {
  active: boolean;
  sort: number;
}

/** GET /api/admin/platform/orgs/:orgId (e resposta do PATCH). */
export interface PlatformOrgDetail {
  organization: PlatformOrgRow;
  /** null = organização sem assinatura (legado). */
  subscription: SubscriptionView | null;
}

/** GET /api/plans (público, página de preços): só planos `public` e `active`. */
export interface PublicPlansResponse {
  plans: PlanView[];
}

/** Uso atual da organização frente aos limites. */
export interface UsageView {
  activeEvents: number;
  members: number;
  /** Maior número de convidados entre os eventos (o limite é por evento). */
  maxGuestsInEvent: number;
  storageBytes: number;
  /** Quando o espaço em disco foi medido (null = nunca). */
  storageComputedAt: string | null;
}

/** GET /api/admin/orgs/:orgId/subscription */
export interface SubscriptionView {
  plan: PlanView;
  status: SubscriptionStatus;
  billingCycle: BillingCycle | null;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  pastDueSince: string | null;
  canceledAt: string | null;
  /** Taxa que vale para os presentes desta organização (override ou a do plano), em bps. */
  effectiveFeeBps: number;
  /** Painel só leitura por inadimplência (carência vencida). O site dos convidados segue no ar. */
  readOnly: boolean;
  usage: UsageView;
  /** Últimas cobranças da assinatura. */
  payments: SubscriptionPaymentView[];
  /** Provedor simulado fora de produção: o painel mostra "Simular pagamento" (dev e e2e). */
  canSimulate?: boolean;
  /**
   * false = produção com a assinatura simulada: nada é cobrado e não há atraso nem bloqueio;
   * o painel mostra "Cobrança de assinaturas ainda não ativa".
   */
  billingActive?: boolean;
}

export interface SubscriptionPaymentView {
  id: number;
  status: SubscriptionPaymentStatus;
  amountCents: number;
  dueOn: string;
  paidAt: string | null;
  invoiceUrl: string | null;
}

/** POST /api/admin/orgs/:orgId/subscription (dono): escolher/trocar o plano. */
export const SubscriptionChangeInput = z.object({
  planCode: z.string().trim().min(1).max(32),
  billingCycle: BillingCycle.default("monthly"),
});
export type SubscriptionChangeInput = z.infer<typeof SubscriptionChangeInput>;

/** Resposta da troca: a assinatura e, se houver cobrança a pagar agora, a fatura do provedor. */
export interface SubscriptionChangeResult {
  subscription: SubscriptionView;
  invoiceUrl: string | null;
}

/* ------------------------------------------------------------------------ */
/* Painel do platform admin (/api/admin/platform/*)                          */
/* ------------------------------------------------------------------------ */

/** GET /api/admin/platform/overview */
export interface PlatformOverview {
  organizations: number;
  activeEvents: number;
  subscriptionsByStatus: Record<SubscriptionStatus, number>;
  /** Taxa da plataforma recebida em presentes nos últimos 30 dias (centavos). */
  feesLast30DaysCents: number;
}

/** Linha de GET /api/admin/platform/orgs */
export interface PlatformOrgRow {
  id: number;
  slug: string;
  name: string;
  status: "active" | "suspended";
  /** null = organização sem assinatura (legado: sem limites, taxa do .env). */
  planCode: string | null;
  planName: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  usage: UsageView;
  createdAt: string;
}

/** PATCH /api/admin/platform/orgs/:orgId (suspender/reativar, plano e taxa negociada). */
export const PlatformOrgUpdate = z
  .object({
    status: z.enum(["active", "suspended"]).optional(),
    planCode: z.string().trim().min(1).max(32).optional(),
    /** null = volta para a taxa do plano. */
    feeBpsOverride: z.number().int().min(0).max(PLAN_FEE_MAX_BPS).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { error: "Nada para mudar." });
export type PlatformOrgUpdate = z.infer<typeof PlatformOrgUpdate>;

/** POST/PATCH /api/admin/platform/plans[/:code] */
export const PlanInput = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: "Código: letras minúsculas, números e hífens." })
    .max(32),
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(2000).nullable().default(null),
  public: z.boolean().default(true),
  active: z.boolean().default(true),
  priceMonthlyCents: z.number().int().min(0).nullable().default(null),
  priceYearlyCents: z.number().int().min(0).nullable().default(null),
  trialDays: z.number().int().min(0).max(365).default(0),
  feeBps: z.number().int().min(0).max(PLAN_FEE_MAX_BPS).default(DEFAULT_PLATFORM_FEE_BPS),
  limits: PlanLimits,
  sort: z.number().int().min(0).max(10_000).default(0),
});
export type PlanInput = z.infer<typeof PlanInput>;
/** PATCH: sem `.default()` (no zod 4 o `.partial()` aplicaria os padrões; ver fase-4). */
export const PlanUpdate = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  public: z.boolean().optional(),
  active: z.boolean().optional(),
  priceMonthlyCents: z.number().int().min(0).nullable().optional(),
  priceYearlyCents: z.number().int().min(0).nullable().optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
  feeBps: z.number().int().min(0).max(PLAN_FEE_MAX_BPS).optional(),
  limits: PlanLimits.optional(),
  sort: z.number().int().min(0).max(10_000).optional(),
});
export type PlanUpdate = z.infer<typeof PlanUpdate>;

/** Mensagem padrão quando um limite do plano barra uma ação (409, código `plan_limit`). */
export function limitMessage(kind: LimitKind, limit: number | null): string {
  const what = LIMIT_LABELS[kind].toLowerCase();
  return limit === null
    ? `O plano atual não permite: ${what}.`
    : `O plano atual permite até ${limit} (${what}). Mude de plano para continuar.`;
}
