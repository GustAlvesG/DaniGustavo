import type { Env } from "../env.ts";
import { createMercadoPagoProvider } from "./mercadopago.ts";
import type { PaymentProvider } from "./provider.ts";
import { createSimulatedProvider, type SimulatedProvider } from "./simulado.ts";

export * from "./provider.ts";
export { createMercadoPagoProvider, mapOrderStatus, snapshotFromOrder } from "./mercadopago.ts";
export { createSimulatedProvider, SIMULATED_CARDS, type SimulatedProvider } from "./simulado.ts";

/** Escolhe o provedor pelo .env (PAYMENT_PROVIDER; padrão: simulado sem credenciais). */
export function createPaymentProvider(env: Env): PaymentProvider {
  if (env.PAYMENT_PROVIDER === "mercadopago") {
    return createMercadoPagoProvider({
      accessToken: env.MP_ACCESS_TOKEN ?? "",
      publicKey: env.MP_PUBLIC_KEY ?? "",
      webhookSecret: env.MP_WEBHOOK_SECRET ?? "",
      apiUrl: env.MP_API_URL,
    });
  }
  // O webhook simulado é assinado com um segredo derivado da WEB_KEY (só a API o conhece).
  return createSimulatedProvider({
    webhookSecret: env.MP_WEBHOOK_SECRET ?? `simulado:${env.WEB_KEY}`,
  });
}

export function isSimulated(provider: PaymentProvider): provider is SimulatedProvider {
  return provider.name === "simulado";
}
