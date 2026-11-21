import { WEBHOOK_TOKEN_HEADER } from "../payments/provider.ts";
import {
  parseSubscriptionWebhook,
  SubscriptionProviderError,
  type SubscriptionPaymentSnapshot,
  type SubscriptionProvider,
  type SubscriptionSnapshot,
} from "./provider.ts";

/*
 * Fase 6, frente A: assinatura de mentira (dev, testes e e2e), no formato do Asaas, como o
 * simulado dos pagamentos: clientes/assinaturas/cobranças em memória, cobrança "paga" (ou
 * "vencida") por um botão de desenvolvimento, que gera o webhook no formato do Asaas para a rota
 * real. Reiniciar a API apaga a memória: assinatura desconhecida responde "ativa, sem cobranças".
 */

/** Webhook pronto para entregar à rota real (`POST /api/webhooks/subscriptions`). */
export interface SimulatedSubscriptionHook {
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface SimulatedBilling extends SubscriptionProvider {
  readonly name: "simulado";
  /** Marca a cobrança aberta mais antiga como paga (ou vencida) e devolve o webhook. */
  simulate(
    providerSubscriptionId: string,
    outcome: "paid" | "overdue",
    now?: Date,
  ): SimulatedSubscriptionHook | null;
}

interface SimSubscription {
  id: string;
  customerId: string;
  valueCents: number;
  cycle: "monthly" | "yearly";
  nextDueDate: string;
  active: boolean;
  payments: SubscriptionPaymentSnapshot[];
}

export function isSimulatedBilling(p: SubscriptionProvider): p is SimulatedBilling {
  return p.name === "simulado" && typeof (p as Partial<SimulatedBilling>).simulate === "function";
}

export function createSimulatedBilling(opts: { webhookSecret: string }): SimulatedBilling {
  const subs = new Map<string, SimSubscription>();
  let seq = 0;
  const nextId = (prefix: string) =>
    `${prefix}_sim_${Date.now().toString(36)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const snapshot = (s: SimSubscription): SubscriptionSnapshot => ({
    providerSubscriptionId: s.id,
    active: s.active,
    nextDueDate: s.nextDueDate,
    raw: { id: s.id, status: s.active ? "ACTIVE" : "INACTIVE" },
  });

  const newPayment = (s: SimSubscription): SubscriptionPaymentSnapshot => {
    const id = nextId("pay");
    return {
      providerPaymentId: id,
      status: "pending",
      amountCents: s.valueCents,
      dueOn: s.nextDueDate,
      paidAt: null,
      invoiceUrl: `https://simulado.invalid/fatura/${id}`,
    };
  };

  return {
    name: "simulado",
    createCustomer() {
      return Promise.resolve({ customerId: nextId("cus") });
    },
    createSubscription(input) {
      const s: SimSubscription = {
        id: nextId("sub"),
        customerId: input.customerId,
        valueCents: input.valueCents,
        cycle: input.cycle,
        nextDueDate: input.nextDueDate,
        active: true,
        payments: [],
      };
      s.payments.push(newPayment(s));
      subs.set(s.id, s);
      return Promise.resolve(snapshot(s));
    },
    updateSubscription(id, input) {
      const s = subs.get(id);
      if (!s) return Promise.reject(new SubscriptionProviderError("Assinatura não existe.", 404));
      s.valueCents = input.valueCents;
      s.cycle = input.cycle;
      // updatePendingPayments: as cobranças em aberto passam a ter o valor novo.
      for (const p of s.payments) if (p.status === "pending") p.amountCents = input.valueCents;
      return Promise.resolve(snapshot(s));
    },
    cancelSubscription(id) {
      const s = subs.get(id);
      if (s) {
        s.active = false;
        for (const p of s.payments) if (p.status === "pending") p.status = "canceled";
      }
      return Promise.resolve();
    },
    getSubscription(id) {
      const s = subs.get(id);
      return Promise.resolve(
        s
          ? snapshot(s)
          : { providerSubscriptionId: id, active: true, nextDueDate: null, raw: null },
      );
    },
    listPayments(id) {
      return Promise.resolve((subs.get(id)?.payments ?? []).map((p) => ({ ...p })));
    },
    parseWebhook(req) {
      return parseSubscriptionWebhook(opts.webhookSecret, req);
    },
    simulate(id, outcome, now = new Date()) {
      const s = subs.get(id);
      const open = s?.payments.find((p) => p.status === "pending" || p.status === "overdue");
      if (!s || !open) return null;
      if (outcome === "paid") {
        open.status = "paid";
        open.paidAt = now;
        // Próximo ciclo: nova cobrança em aberto, como o Asaas gera.
        const [y, m, d] = open.dueOn.split("-").map(Number) as [number, number, number];
        const next =
          s.cycle === "yearly" ? new Date(Date.UTC(y + 1, m - 1, d)) : new Date(Date.UTC(y, m, d));
        s.nextDueDate = next.toISOString().slice(0, 10);
        s.payments.push(newPayment(s));
      } else {
        open.status = "overdue";
      }
      return {
        path: "/api/webhooks/subscriptions",
        headers: { "Content-Type": "application/json", [WEBHOOK_TOKEN_HEADER]: opts.webhookSecret },
        body: {
          id: nextId("evt"),
          event: outcome === "paid" ? "PAYMENT_RECEIVED" : "PAYMENT_OVERDUE",
          payment: { object: "payment", id: open.providerPaymentId, subscription: s.id },
        },
      };
    },
  };
}
