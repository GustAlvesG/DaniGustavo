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
 * Uma instância por `Env` (WeakMap): o app (webhook), o painel da organização e as rotinas
 * usam o mesmo provedor sem precisar passá-lo por dependências que não o conhecem (o simulado
 * guarda as assinaturas em memória: instâncias diferentes não se enxergariam).
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

/**
 * O provedor que vale para estas dependências: o injetado (`deps.billing`, testes) ou o do .env.
 * Até a integração passar `billing` no `AdminDeps`, o painel cai no do .env (mesma instância
 * do app, pela WeakMap acima).
 */
export function billingOf(deps: {
  env: Env;
  billing?: SubscriptionProvider;
}): SubscriptionProvider {
  return deps.billing ?? createSubscriptionProvider(deps.env);
}

/** Registra o provedor de um `Env` (testes que injetam `billing` no createApp e no painel). */
export function setSubscriptionProvider(env: Env, provider: SubscriptionProvider): void {
  byEnv.set(env, provider);
}
