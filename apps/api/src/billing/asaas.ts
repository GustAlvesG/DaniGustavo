import { AsaasApiError, ASAAS_URLS, type AsaasEnvironment } from "../payments/asaas.ts";
import { PaymentProviderError } from "../payments/provider.ts";
import { PLATFORM_NAME, type SubscriptionPaymentStatus } from "@casamento/shared";
import {
  parseSubscriptionWebhook,
  type SubscriptionPaymentSnapshot,
  type SubscriptionProvider,
  type SubscriptionSnapshot,
} from "./provider.ts";

/*
 * Fase 6, frente A: assinaturas no Asaas (API v3, contrato em provider.ts), com `fetch` e a
 * chave da conta PRINCIPAL. `billingType: UNDEFINED` (a organização escolhe Pix/boleto/cartão na
 * fatura hospedada; nenhum dado de cartão passa por nós). Testes: `doFetch` com respostas
 * gravadas (apps/api/test/fixtures/asaas/subscriptions/), nunca a API real.
 */

interface AsaasSubscription {
  id: string;
  status?: string;
  nextDueDate?: string | null;
  deleted?: boolean;
}

interface AsaasSubscriptionPayment {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  confirmedDate?: string | null;
  invoiceUrl?: string | null;
  deleted?: boolean;
}

const CYCLES = { monthly: "MONTHLY", yearly: "YEARLY" } as const;

/** Centavos → reais com duas casas (o Asaas recebe `value` em reais). */
export const centsToReais = (cents: number) => Math.round(cents) / 100;
const reaisToCents = (value: number) => Math.round(value * 100);

/** Status da cobrança no Asaas → status da cobrança da assinatura. */
export function mapSubscriptionPaymentStatus(
  p: Pick<AsaasSubscriptionPayment, "status" | "deleted">,
): SubscriptionPaymentStatus {
  if (p.deleted) return "canceled";
  switch (p.status) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return "paid";
    case "OVERDUE":
      return "overdue";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
      return "refunded";
    default:
      return "pending";
  }
}

/** Data do Asaas (AAAA-MM-DD, horário de Brasília) → meio-dia UTC daquele dia. */
const asaasDay = (day: string | null | undefined) =>
  day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T15:00:00Z`) : null;

function paymentSnapshot(p: AsaasSubscriptionPayment): SubscriptionPaymentSnapshot {
  const status = mapSubscriptionPaymentStatus(p);
  return {
    providerPaymentId: p.id,
    status,
    amountCents: reaisToCents(p.value),
    dueOn: p.dueDate,
    paidAt:
      status === "paid"
        ? asaasDay(p.paymentDate ?? p.clientPaymentDate ?? p.confirmedDate ?? p.dueDate)
        : null,
    invoiceUrl: p.invoiceUrl ? p.invoiceUrl.slice(0, 300) : null,
  };
}

function subscriptionSnapshot(s: AsaasSubscription): SubscriptionSnapshot {
  return {
    providerSubscriptionId: s.id,
    active: s.status === "ACTIVE" && !s.deleted,
    nextDueDate: s.nextDueDate ?? null,
    raw: { id: s.id, status: s.status ?? null, nextDueDate: s.nextDueDate ?? null },
  };
}

export function createAsaasBilling(opts: {
  apiKey: string;
  environment: AsaasEnvironment;
  webhookToken: string;
  doFetch?: typeof fetch;
  /** Outra URL da API (testes). */
  apiUrl?: string;
}): SubscriptionProvider {
  const base = (opts.apiUrl ?? ASAAS_URLS[opts.environment]).replace(/\/+$/, "");
  const doFetch = opts.doFetch ?? fetch;
  const userAgent = `${PLATFORM_NAME}/1.0 (Node.js; ${opts.environment})`;

  async function call<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown) {
    const headers: Record<string, string> = {
      access_token: opts.apiKey,
      accept: "application/json",
      "user-agent": userAgent,
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new PaymentProviderError("O Asaas não respondeu.", 0, String(err));
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      const errors = (json as { errors?: { code?: unknown; description?: unknown }[] } | undefined)
        ?.errors;
      throw new AsaasApiError(
        `O Asaas respondeu ${res.status} em ${method} ${path.split("?")[0]}.`,
        res.status,
        Array.isArray(errors)
          ? errors.map((e) => ({
              code: typeof e?.code === "string" ? e.code.slice(0, 64) : undefined,
              description:
                typeof e?.description === "string" ? e.description.slice(0, 300) : undefined,
            }))
          : [],
      );
    }
    return json as T;
  }

  const ref = (organizationId: number) => `org:${organizationId}`;

  return {
    name: "asaas",
    async createCustomer(input) {
      const created = await call<{ id: string }>("POST", "/customers", {
        name: input.name,
        email: input.email,
        ...(input.cpfCnpj ? { cpfCnpj: input.cpfCnpj.replace(/\D/g, "") } : {}),
        externalReference: ref(input.organizationId),
      });
      return { customerId: created.id };
    },
    async createSubscription(input) {
      const created = await call<AsaasSubscription>("POST", "/subscriptions", {
        customer: input.customerId,
        billingType: "UNDEFINED",
        value: centsToReais(input.valueCents),
        nextDueDate: input.nextDueDate,
        cycle: CYCLES[input.cycle],
        description: `Plano ${input.planName}`.slice(0, 500),
        externalReference: ref(input.organizationId),
      });
      return subscriptionSnapshot(created);
    },
    async updateSubscription(id, input) {
      const updated = await call<AsaasSubscription>(
        "PUT",
        `/subscriptions/${encodeURIComponent(id)}`,
        {
          value: centsToReais(input.valueCents),
          cycle: CYCLES[input.cycle],
          description: `Plano ${input.planName}`.slice(0, 500),
          updatePendingPayments: true,
        },
      );
      return subscriptionSnapshot(updated);
    },
    async cancelSubscription(id) {
      await call("DELETE", `/subscriptions/${encodeURIComponent(id)}`);
    },
    async getSubscription(id) {
      return subscriptionSnapshot(
        await call<AsaasSubscription>("GET", `/subscriptions/${encodeURIComponent(id)}`),
      );
    },
    async listPayments(id) {
      const list = await call<{ data?: AsaasSubscriptionPayment[] }>(
        "GET",
        `/subscriptions/${encodeURIComponent(id)}/payments?limit=100`,
      );
      return (list.data ?? []).map(paymentSnapshot);
    },
    parseWebhook(req) {
      return parseSubscriptionWebhook(opts.webhookToken, req);
    },
  };
}
