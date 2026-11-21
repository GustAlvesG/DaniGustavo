import type { Env } from "../env.ts";
import { createAsaasBilling } from "./asaas.ts";
import type { SubscriptionProvider } from "./provider.ts";
import { createSimulatedBilling } from "./simulado.ts";

export * from "./provider.ts";
export { createAsaasBilling } from "./asaas.ts";
export { createSimulatedBilling } from "./simulado.ts";

/** Escolhe o provedor da assinatura pelo .env (`BILLING_PROVIDER`; padrão: simulado). */
export function createSubscriptionProvider(env: Env): SubscriptionProvider {
  if (env.BILLING_PROVIDER === "asaas") {
    return createAsaasBilling({
      apiKey: env.ASAAS_API_KEY ?? "",
      environment: env.ASAAS_ENV,
      webhookToken: env.ASAAS_WEBHOOK_TOKEN ?? "",
    });
  }
  return createSimulatedBilling({ webhookSecret: `simulado-assinatura:${env.WEB_KEY}` });
}
