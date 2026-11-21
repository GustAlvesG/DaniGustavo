import { notImplementedBilling, type SubscriptionProvider } from "./provider.ts";

/*
 * Fase 6, frente A: assinatura de mentira (dev, testes e e2e), no formato do Asaas, como o
 * simulado dos pagamentos: clientes/assinaturas/cobranças em memória, cobrança "paga" por um
 * botão de desenvolvimento e webhook entregue à rota real. Reservado pela fundação.
 */
export function createSimulatedBilling(opts: { webhookSecret: string }): SubscriptionProvider {
  void opts;
  const no = (what: string) => () => Promise.reject(notImplementedBilling(what));
  return {
    name: "simulado",
    createCustomer: no("Cliente da assinatura (simulado)"),
    createSubscription: no("Assinatura (simulado)"),
    updateSubscription: no("Troca de plano (simulado)"),
    cancelSubscription: no("Cancelar assinatura (simulado)"),
    getSubscription: no("Consultar assinatura (simulado)"),
    listPayments: no("Cobranças da assinatura (simulado)"),
    parseWebhook: () => {
      throw notImplementedBilling("Webhook da assinatura (simulado)");
    },
  };
}
