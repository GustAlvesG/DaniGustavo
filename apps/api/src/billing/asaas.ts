import { notImplementedBilling, type SubscriptionProvider } from "./provider.ts";
import type { AsaasEnvironment } from "../payments/index.ts";

/*
 * Fase 6, frente A: assinaturas no Asaas (`/v3/customers`, `/v3/subscriptions`, contrato em
 * provider.ts), com `fetch` e a chave da conta PRINCIPAL. Reservado pela fundação.
 */
export function createAsaasBilling(opts: {
  apiKey: string;
  environment: AsaasEnvironment;
  webhookToken: string;
  doFetch?: typeof fetch;
}): SubscriptionProvider {
  void opts;
  const no = (what: string) => () => Promise.reject(notImplementedBilling(what));
  return {
    name: "asaas",
    createCustomer: no("Cliente da assinatura (Asaas)"),
    createSubscription: no("Assinatura (Asaas)"),
    updateSubscription: no("Troca de plano (Asaas)"),
    cancelSubscription: no("Cancelar assinatura (Asaas)"),
    getSubscription: no("Consultar assinatura (Asaas)"),
    listPayments: no("Cobranças da assinatura (Asaas)"),
    parseWebhook: () => {
      throw notImplementedBilling("Webhook da assinatura (Asaas)");
    },
  };
}
