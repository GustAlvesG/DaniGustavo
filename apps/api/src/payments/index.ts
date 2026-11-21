import type { Env } from "../env.ts";
import { createAsaasProvider } from "./asaas.ts";
import type { PaymentProvider } from "./provider.ts";
import {
  createSimulatedProvider,
  SIMULATED_PLATFORM_WALLET,
  type SimulatedProvider,
} from "./simulado.ts";

export * from "./provider.ts";
export {
  ASAAS_URLS,
  AsaasApiError,
  asaasEnvFromKey,
  createAsaasProvider,
  mapAsaasStatus,
  snapshotFromPayment,
  type AsaasEnvironment,
  type AsaasPayment,
} from "./asaas.ts";
export {
  computeSimulatedSplit,
  createSimulatedProvider,
  scenarioFromEmail,
  SIMULATED_ACCOUNT_SCENARIOS,
  SIMULATED_CARDS,
  SIMULATED_ONBOARDING_URL,
  SIMULATED_PLATFORM_WALLET,
  simulatedAccountStatus,
  type SimulatedAccountScenario,
  type SimulatedOperation,
  type SimulatedProvider,
} from "./simulado.ts";

/** Escolhe o provedor pelo .env (PAYMENT_PROVIDER; padrão: simulado). */
export function createPaymentProvider(env: Env): PaymentProvider {
  if (env.PAYMENT_PROVIDER === "asaas") {
    if (env.NODE_ENV === "development") {
      if (!env.ASAAS_WEBHOOK_TOKEN) {
        console.warn(
          "[pagamentos] ASAAS_WEBHOOK_TOKEN vazio: todo webhook do Asaas recebe 401. O status é conferido no Asaas pela tela de pagamento e pela rotina de expiração.",
        );
      }
      if (env.ASAAS_ENV === "producao") {
        console.warn(
          "[pagamentos] Atenção: Asaas de PRODUÇÃO em desenvolvimento. Pix e cartão gerados aqui são cobranças reais. Para testar, use a chave do sandbox ($aact_hmlg_…).",
        );
      }
    }
    return createAsaasProvider({
      apiKey: env.ASAAS_API_KEY ?? "",
      environment: env.ASAAS_ENV,
      webhookToken: env.ASAAS_WEBHOOK_TOKEN ?? "",
    });
  }
  // O webhook simulado leva um token derivado da WEB_KEY (só a API o conhece).
  return createSimulatedProvider({ webhookSecret: `simulado:${env.WEB_KEY}` });
}

/**
 * Carteira da plataforma, destino do split. Asaas: `ASAAS_PLATFORM_WALLET_ID` (obrigatória com
 * taxa, ver env.ts); simulado: a do env ou uma fictícia. null = sem para onde repassar.
 */
export function platformWalletId(env: Env, provider: PaymentProvider): string | null {
  if (env.ASAAS_PLATFORM_WALLET_ID) return env.ASAAS_PLATFORM_WALLET_ID;
  return provider.name === "simulado" ? SIMULATED_PLATFORM_WALLET : null;
}

export function isSimulated(provider: PaymentProvider): provider is SimulatedProvider {
  return provider.name === "simulado";
}
