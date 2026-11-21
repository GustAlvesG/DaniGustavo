import type { BillingCycle, SubscriptionPaymentStatus } from "@casamento/shared";
import { PaymentProviderError, type WebhookRequest } from "../payments/provider.ts";

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

/** Método reservado pela fundação, ainda sem implementação. */
export function notImplementedBilling(what: string): PaymentProviderError {
  return new PaymentProviderError(`${what}: ainda não implementado (Fase 6, frente A).`, 501);
}
