import {
  bigint,
  boolean,
  date,
  foreignKey,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { user } from "./auth.ts";
import { fk, json, pk, timestamps, utcDatetime } from "./columns.ts";
import { organizations } from "./tenancy.ts";

/*
 * Fase 6 (docs/saas/fase-6.md): comercial da plataforma — planos, assinaturas das organizações,
 * cobranças da assinatura, uso, cadastro self-service e aceite dos termos. Migration 0012.
 *
 * `plans`, `signup_requests` e `legal_acceptances` são da plataforma (sem organização/evento:
 * exceções declaradas em `PLATFORM_TABLES` do auditor de SQL). As demais levam
 * `organization_id` e o auditor exige a coluna no WHERE/ON.
 */

/** Situação da assinatura de uma organização. `internal` = plano interno, sem cobrança. */
export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "internal",
] as const;
export const BILLING_CYCLES = ["monthly", "yearly"] as const;
export const SUBSCRIPTION_PAYMENT_STATUSES = [
  "pending",
  "paid",
  "overdue",
  "refunded",
  "canceled",
] as const;
/** Provedor da assinatura (o mesmo par do pagamento dos presentes). */
export const BILLING_PROVIDERS = ["simulado", "asaas"] as const;
export const LEGAL_DOCUMENTS = ["terms", "privacy"] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type BillingCycle = (typeof BILLING_CYCLES)[number];
export type SubscriptionPaymentStatus = (typeof SUBSCRIPTION_PAYMENT_STATUSES)[number];
export type BillingProviderName = (typeof BILLING_PROVIDERS)[number];
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

/** Código do plano interno da organização 1 (casamento): sem limites, sem cobrança, taxa 0. */
export const COURTESY_PLAN_CODE = "cortesia";

/**
 * Catálogo de planos. Preços em centavos (nulo = sob consulta / `TODO(conteudo)`); limites em
 * JSON (`PlanLimits` em @casamento/shared › plans: nulo em cada campo = sem limite). `public`
 * = aparece na página de preços; planos internos (Cortesia) só o platform admin atribui.
 */
export const plans = mysqlTable("plans", {
  id: pk(),
  /** Identificador estável (o seed faz upsert por ele), ex.: "essencial". */
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 64 }).notNull(),
  description: text("description"),
  public: boolean("public").notNull().default(true),
  active: boolean("active").notNull().default(true),
  priceMonthlyCents: int("price_monthly_cents"),
  priceYearlyCents: int("price_yearly_cents"),
  trialDays: int("trial_days").notNull().default(0),
  /** Taxa da plataforma sobre os presentes, em centésimos de ponto (50 = 0,5%). */
  feeBps: int("fee_bps").notNull().default(50),
  limits: json<unknown>("limits").notNull(),
  sort: int("sort").notNull().default(0),
  ...timestamps(),
});

/**
 * Assinatura corrente da organização (uma por organização; trocar de plano atualiza a linha).
 * Inadimplência nunca derruba o site dos convidados: só limita o painel (ver fase-6.md §3).
 */
export const organizationSubscriptions = mysqlTable(
  "organization_subscriptions",
  {
    id: pk(),
    organizationId: fk("organization_id")
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: fk("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    status: mysqlEnum("status", SUBSCRIPTION_STATUSES).notNull(),
    billingCycle: mysqlEnum("billing_cycle", BILLING_CYCLES),
    provider: mysqlEnum("provider", BILLING_PROVIDERS),
    /** Cliente no provedor (Asaas: cus_…). */
    providerCustomerId: varchar("provider_customer_id", { length: 64 }),
    /** Assinatura no provedor (Asaas: sub_…). */
    providerSubscriptionId: varchar("provider_subscription_id", { length: 64 }).unique(),
    trialEndsAt: utcDatetime("trial_ends_at"),
    currentPeriodEndsAt: utcDatetime("current_period_ends_at"),
    /** Primeira cobrança vencida sem pagamento (começo da carência). */
    pastDueSince: utcDatetime("past_due_since"),
    canceledAt: utcDatetime("canceled_at"),
    /** Taxa negociada para esta organização (nulo = a do plano). */
    feeBpsOverride: int("fee_bps_override"),
    ...timestamps(),
  },
  (t) => [index("organization_subscriptions_plan_idx").on(t.planId)],
);

/** Cobranças da assinatura (uma por ciclo), como o provedor informa. */
export const subscriptionPayments = mysqlTable(
  "subscription_payments",
  {
    id: pk(),
    organizationId: fk("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subscriptionId: fk("subscription_id").notNull(),
    /** Cobrança no provedor (Asaas: pay_…). */
    providerPaymentId: varchar("provider_payment_id", { length: 64 }).notNull().unique(),
    status: mysqlEnum("status", SUBSCRIPTION_PAYMENT_STATUSES).notNull(),
    amountCents: int("amount_cents").notNull(),
    dueOn: date("due_on", { mode: "string" }).notNull(),
    paidAt: utcDatetime("paid_at"),
    /** Fatura hospedada do provedor (onde a organização paga). */
    invoiceUrl: varchar("invoice_url", { length: 300 }),
    ...timestamps(),
  },
  (t) => [
    index("subscription_payments_org_due_idx").on(t.organizationId, t.dueOn),
    // Nome curto: o gerado passaria de 64 caracteres (limite do MySQL/MariaDB).
    foreignKey({
      name: "subscription_payments_subscription_fk",
      columns: [t.subscriptionId],
      foreignColumns: [organizationSubscriptions.id],
    }).onDelete("cascade"),
  ],
);

/**
 * Uso medido da organização (cache recalculado por rotina e depois de uploads): o que é caro de
 * contar na hora. Eventos ativos, convidados e membros são contados na hora pelo serviço.
 */
export const organizationUsage = mysqlTable("organization_usage", {
  id: pk(),
  organizationId: fk("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  /** Bytes em disco de todos os eventos da organização (fotos, presentes e contratos). */
  storageBytes: bigint("storage_bytes", { mode: "number", unsigned: true }).notNull().default(0),
  computedAt: utcDatetime("computed_at").notNull(),
  ...timestamps(),
});

/**
 * Cadastro self-service pendente de verificação de e-mail. O token vai só no e-mail (aqui o
 * SHA-256); a senha é definida na confirmação, então nada de credencial fica guardado antes de
 * o e-mail ser provado. Confirmado: cria `user` + `account` + organização (dono) + assinatura.
 */
export const signupRequests = mysqlTable(
  "signup_requests",
  {
    id: pk(),
    /** Minúsculo, sem espaços. */
    email: varchar("email", { length: 191 }).notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    organizationName: varchar("organization_name", { length: 191 }).notNull(),
    /** Plano escolhido na página de preços (código); nulo = o padrão do cadastro. */
    planCode: varchar("plan_code", { length: 32 }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    termsVersion: varchar("terms_version", { length: 16 }).notNull(),
    privacyVersion: varchar("privacy_version", { length: 16 }).notNull(),
    /** SHA-256 do IP (rate limit e auditoria sem guardar o IP em claro). */
    ipHash: varchar("ip_hash", { length: 64 }),
    expiresAt: utcDatetime("expires_at").notNull(),
    confirmedAt: utcDatetime("confirmed_at"),
    userId: varchar("user_id", { length: 36 }).references(() => user.id, {
      onDelete: "set null",
    }),
    organizationId: fk("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => [index("signup_requests_email_idx").on(t.email)],
);

/** Aceite dos termos de uso e da política de privacidade (versão e quando), por pessoa. */
export const legalAcceptances = mysqlTable(
  "legal_acceptances",
  {
    id: pk(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    document: mysqlEnum("document", LEGAL_DOCUMENTS).notNull(),
    version: varchar("version", { length: 16 }).notNull(),
    acceptedAt: utcDatetime("accepted_at").notNull(),
    ipHash: varchar("ip_hash", { length: 64 }),
  },
  (t) => [
    uniqueIndex("legal_acceptances_user_doc_version_idx").on(t.userId, t.document, t.version),
  ],
);
