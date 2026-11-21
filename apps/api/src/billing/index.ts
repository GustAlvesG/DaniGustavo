import type { Env } from "../env.ts";
import { createAsaasBilling } from "./asaas.ts";
import type { SubscriptionProvider } from "./provider.ts";
import { createSimulatedBilling } from "./simulado.ts";

export * from "./provider.ts";
export { createAsaasBilling } from "./asaas.ts";
export {
  createSimulatedBilling,
  isSimulatedBilling,
  type SimulatedBilling,
  type SimulatedSubscriptionHook,
} from "./simulado.ts";

/*
 * Uma instância por `Env` (WeakMap): o simulado guarda as assinaturas em memória, então quem
 * cair no padrão (app, rotina) com o mesmo `Env` enxerga as mesmas assinaturas. O server.ts
 * cria uma só e a passa ao app (webhook e `AdminDeps.billing`) e à rotina.
 */
const byEnv = new WeakMap<Env, SubscriptionProvider>();

/** Escolhe o provedor da assinatura pelo .env (`BILLING_PROVIDER`; padrão: simulado). */
export function createSubscriptionProvider(env: Env): SubscriptionProvider {
  const cached = byEnv.get(env);
  if (cached) return cached;
  const provider =
    env.BILLING_PROVIDER === "asaas"
      ? createAsaasBilling({
          apiKey: env.ASAAS_API_KEY ?? "",
          environment: env.ASAAS_ENV,
          webhookToken: env.ASAAS_WEBHOOK_TOKEN ?? "",
        })
      : createSimulatedBilling({ webhookSecret: `simulado-assinatura:${env.WEB_KEY}` });
  byEnv.set(env, provider);
  return provider;
}
