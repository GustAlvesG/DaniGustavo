import type { BillingCycle, SubscriptionPaymentStatus } from "@casamento/shared";
import {
  PaymentProviderError,
  verifyWebhookToken,
  type WebhookRequest,
} from "../payments/provider.ts";

/*
 * Fase 6, frente A (docs/saas/fase-6.md §2): cobrança da assinatura das organizações. Mesmo
 * desenho dos pagamentos: o resto da API só conhece esta interface; `simulado` (padrão, sem
 * conta) e `asaas` (API v3 com `fetch`, conta PRINCIPAL da plataforma, `ASAAS_API_KEY`).
 *
 * Contrato do Asaas (o que a frente A implementa):
 * - cliente: `POST /v3/customers` (`name`, `email`, `cpfCnpj` quando houver; `externalReference`
 *   = `org:<id>`), reaproveitado por `provider_customer_id`;
 * - assinatura: `POST /v3/subscriptions` (`customer`, `billingType: "UNDEFINED"` — a organização
 *   escolhe Pix/boleto/cartão na fatura —, `value` em reais, `nextDueDate`, `cycle` MONTHLY/
 *   YEARLY, `description`, `externalReference` = `org:<id>`); trocar de plano =
 *   `PUT /v3/subscriptions/:id` (`value`, `cycle`, `updatePendingPayments: true`); cancelar =
 *   `DELETE /v3/subscriptions/:id`;
 * - cobranças: `GET /v3/subscriptions/:id/payments` (`invoiceUrl`, `status`, `dueDate`, `value`);
 * - webhook: mesmos eventos PAYMENT_* do Asaas com o campo `payment.subscription`, numa URL
 *   própria (`/api/webhooks/subscriptions`, token `ASAAS_WEBHOOK_TOKEN`), idempotente por
 *   `webhook_events`; o status é sempre consultado no provedor.
 * Nunca chamar o Asaas real em teste: respostas gravadas em `apps/api/test/fixtures/asaas/`.
 */

export interface BillingCustomerInput {
  organizationId: number;
  name: string;
  email: string;
  /** CPF/CNPJ de quem paga, quando houver (o Asaas pode exigir para emitir a cobrança). */
  cpfCnpj?: string | null;
}

export interface SubscriptionInput {
  customerId: string;
  organizationId: number;
  planName: string;
  valueCents: number;
  cycle: BillingCycle;
  /** Primeira cobrança (AAAA-MM-DD): fim do teste ou hoje. */
  nextDueDate: string;
}

export interface SubscriptionSnapshot {
  providerSubscriptionId: string;
  /** ACTIVE/INACTIVE/EXPIRED no Asaas → ativa ou não. */
  active: boolean;
  nextDueDate: string | null;
  raw: unknown;
}

export interface SubscriptionPaymentSnapshot {
  providerPaymentId: string;
  status: SubscriptionPaymentStatus;
  amountCents: number;
  dueOn: string;
  paidAt: Date | null;
  invoiceUrl: string | null;
}

/** Aviso do webhook: qual cobrança de qual assinatura mudou. */
export interface SubscriptionWebhookNotice {
  eventId: string;
  providerPaymentId: string;
  providerSubscriptionId: string;
  type: string;
}

export interface SubscriptionProvider {
  readonly name: "simulado" | "asaas";
  createCustomer(input: BillingCustomerInput): Promise<{ customerId: string }>;
  createSubscription(input: SubscriptionInput): Promise<SubscriptionSnapshot>;
  updateSubscription(
    providerSubscriptionId: string,
    input: Pick<SubscriptionInput, "valueCents" | "cycle" | "planName">,
  ): Promise<SubscriptionSnapshot>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  getSubscription(providerSubscriptionId: string): Promise<SubscriptionSnapshot>;
  listPayments(providerSubscriptionId: string): Promise<SubscriptionPaymentSnapshot[]>;
  /** Confere o token e lê o aviso; null = ignorar (evento que não interessa). Token errado lança. */
  parseWebhook(req: WebhookRequest): SubscriptionWebhookNotice | null;
}

/** Erro do provedor de assinatura (mesma classe dos pagamentos: rota → 502). */
export { PaymentProviderError as SubscriptionProviderError };

/** Token do webhook da assinatura não confere (a rota responde 401). */
export class SubscriptionWebhookTokenError extends Error {
  constructor() {
    super("Token do webhook da assinatura inválido.");
    this.name = "SubscriptionWebhookTokenError";
  }
}

/**
 * Eventos de cobrança que podem mudar a assinatura (os outros: 200 e ignorados, sem consultar o
 * provedor). O status em si sempre vem do provedor (`listPayments`).
 */
export const HANDLED_SUBSCRIPTION_EVENTS = new Set([
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_CHARGEBACK_REQUESTED",
]);

/**
 * Webhook no formato do Asaas (simulado e Asaas): confere o token do header
 * `asaas-access-token` em tempo constante (lança `SubscriptionWebhookTokenError`) e lê
 * `{ id, event, payment: { id, subscription } }`. Cobrança avulsa (sem `subscription`) ou evento
 * que não interessa → null.
 */
export function parseSubscriptionWebhook(
  token: string,
  req: WebhookRequest,
): SubscriptionWebhookNotice | null {
  if (!verifyWebhookToken(token, req)) throw new SubscriptionWebhookTokenError();
  const body = req.body as
    | { id?: unknown; event?: unknown; payment?: { id?: unknown; subscription?: unknown } }
    | undefined;
  const type = typeof body?.event === "string" ? body.event : "";
  const paymentId = body?.payment?.id;
  const subscriptionId = body?.payment?.subscription;
  if (!HANDLED_SUBSCRIPTION_EVENTS.has(type)) return null;
  if (typeof paymentId !== "string" || typeof subscriptionId !== "string" || !subscriptionId) {
    return null;
  }
  const eventId = typeof body?.id === "string" && body.id ? body.id : `${type}:${paymentId}`;
  return {
    eventId: eventId.slice(0, 100),
    providerPaymentId: paymentId,
    providerSubscriptionId: subscriptionId,
    type,
  };
}

/** AAAA-MM-DD de uma data no fuso de São Paulo (vencimentos do Asaas). */
export function isoDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/** Soma um ciclo (mês ou ano) a uma data AAAA-MM-DD, em UTC (fim do período pago). */
export function addCycle(day: string, cycle: BillingCycle): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return cycle === "yearly"
    ? new Date(Date.UTC(y + 1, m - 1, d, 23, 59, 59))
    : new Date(Date.UTC(y, m, d, 23, 59, 59));
}
