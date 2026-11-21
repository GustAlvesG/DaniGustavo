import type { Database } from "@casamento/db";
import type { EventPaymentState } from "@casamento/shared";
import type { SecretBox } from "../crypto/secret-box.ts";
import { paymentsLive, type Env } from "../env.ts";
import { organizationFeeBps } from "../plans/fees.ts";
import {
  platformWalletId,
  PaymentProviderError,
  type PaymentProvider,
  type SplitRule,
} from "../payments/index.ts";
import type { EventCtx } from "../tenancy/types.ts";
import {
  accountCredentials,
  getOrgPaymentAccount,
  loadEventReceiverAccount,
  receiverState,
  type PaymentAccountRow,
} from "./store.ts";

/*
 * Fase 5, frente B (docs/saas/fase-5.md): para qual conta vai a cobrança de um evento e por
 * qual conta se fala com o provedor sobre um pedido.
 */

export interface ReceiverDeps {
  env: Env;
  db: Database;
  /** Provedor da conta principal (o do .env). */
  provider: PaymentProvider;
  secrets: SecretBox;
}

/** Conta que cobra os presentes do evento agora. */
export interface ChargeAccount {
  /** Provedor que cria a cobrança: a conta principal ou `provider.forAccount(subconta)`. */
  provider: PaymentProvider;
  /** Subconta (`payment_accounts.id`); null = conta principal (`receiver = platform`). */
  accountId: number | null;
  /** Repasse à carteira da plataforma (vazio sem taxa ou na conta principal). */
  split: SplitRule[];
  /** Taxa gravada no pedido (`gift_orders.platform_fee_bps`); 0 sem split. */
  feeBps: number;
}

export type ReceiverResolution =
  | { ok: true; state: Extract<EventPaymentState, "ready" | "platform">; charge: ChargeAccount }
  | { ok: false; state: Extract<EventPaymentState, "no_account" | "not_approved"> };

/**
 * A subconta é do provedor em uso? (Ex.: criada no simulado em dev e a API agora com Asaas: não
 * dá para cobrar nela, conta como "sem conta" e o painel pede outra.)
 */
function sameProvider(account: PaymentAccountRow, provider: PaymentProvider): boolean {
  return account.provider === provider.name && typeof provider.forAccount === "function";
}

/**
 * Situação de recebimento do evento sem decifrar nada (lista de presentes do site): o mesmo
 * cálculo de `receiverState`, mais a conferência do provedor.
 */
export async function eventPaymentState(
  ev: EventCtx,
  deps: Pick<ReceiverDeps, "db" | "provider"> & { env?: Env },
): Promise<EventPaymentState> {
  // Produção com o provedor simulado: nenhum evento recebe (a criação do pedido também confere).
  if (deps.env && !paymentsLive(deps.env)) return "no_account";
  const loaded = await loadEventReceiverAccount(deps.db, ev);
  const state = receiverState(loaded);
  if (state === "ready" && !sameProvider(loaded.account!, deps.provider)) return "no_account";
  // Fase 6: taxa do plano > 0 sem carteira da plataforma para o split → sem presentes em
  // dinheiro (só quando quem chama passa o env; a criação do pedido sempre confere).
  if (state === "ready" && deps.env && !platformWalletId(deps.env, deps.provider)) {
    if ((await organizationFeeBps(deps.db, deps.env, ev.orgId)) > 0) return "no_account";
  }
  return state;
}

/** Split da plataforma para uma taxa (vazio sem taxa ou sem carteira de destino). */
export function platformSplit(
  deps: Pick<ReceiverDeps, "env" | "provider">,
  feeBps: number,
): SplitRule[] {
  const walletId = platformWalletId(deps.env, deps.provider);
  if (!(feeBps > 0) || !walletId) return [];
  return [{ walletId, percent: feeBps / 100 }];
}

/**
 * `events.payment_receiver` → conta. `organization`: a conta ativa da organização;
 * `host`: `events.receiving_account_id`; `platform`: a conta principal, sem split. Conta
 * ausente/desativada → `no_account`; não aprovada → `not_approved` (o site esconde o
 * pagamento e `POST /orders` responde 409).
 */
export async function resolveEventReceiver(
  ev: EventCtx,
  deps: ReceiverDeps,
): Promise<ReceiverResolution> {
  if (!paymentsLive(deps.env)) return { ok: false, state: "no_account" };
  const loaded = await loadEventReceiverAccount(deps.db, ev);
  const state = receiverState(loaded);
  if (state === "platform") {
    return {
      ok: true,
      state,
      charge: { provider: deps.provider, accountId: null, split: [], feeBps: 0 },
    };
  }
  if (state !== "ready") return { ok: false, state };
  const account = loaded.account!;
  if (!sameProvider(account, deps.provider)) {
    console.warn(
      `[recebimentos] A conta ${account.id} é do provedor ${account.provider}, mas a API usa ${deps.provider.name}: presentes indisponíveis no evento ${ev.id}.`,
    );
    return { ok: false, state: "no_account" };
  }
  // Fase 6: taxa do plano da organização (override negociado, plano ou, sem assinatura, o .env).
  const planFeeBps = await organizationFeeBps(deps.db, deps.env, ev.orgId);
  if (planFeeBps > 0 && !platformWalletId(deps.env, deps.provider)) {
    console.warn(
      `[recebimentos] Taxa de ${planFeeBps / 100}% no evento ${ev.id}, mas sem ASAAS_PLATFORM_WALLET_ID: presentes indisponíveis.`,
    );
    return { ok: false, state: "no_account" };
  }
  const creds = accountCredentials(deps.secrets, account);
  // Nunca repassar para a carteira da própria conta que cobra (o Asaas recusa).
  const split = platformSplit(deps, planFeeBps).filter((s) => s.walletId !== creds.walletId);
  const feeBps = split.length ? planFeeBps : 0;
  return {
    ok: true,
    state,
    charge: { provider: deps.provider.forAccount!(creds), accountId: account.id, split, feeBps },
  };
}

/**
 * Provedor para falar de um pedido já criado (consulta, reembolso, cancelamento, conciliação):
 * `gift_orders.payment_account_id` nulo = conta principal; senão, `forAccount` da subconta
 * (mesmo desativada: o pedido antigo continua nela). A conta é buscada na organização do evento.
 */
export async function providerForOrder(
  ev: EventCtx,
  deps: ReceiverDeps,
  order: { paymentAccountId: number | null },
): Promise<PaymentProvider> {
  if (order.paymentAccountId === null) return deps.provider;
  const account = await getOrgPaymentAccount(deps.db, ev.orgId, order.paymentAccountId);
  if (!account) {
    throw new Error(`Subconta ${order.paymentAccountId} do pedido não existe no evento ${ev.id}.`);
  }
  return providerForAccount(deps, account);
}

/** A instância do provedor que age pela subconta (lança se o provedor não for o dela). */
export function providerForAccount(
  deps: Pick<ReceiverDeps, "provider" | "secrets">,
  account: PaymentAccountRow,
): PaymentProvider {
  if (!sameProvider(account, deps.provider)) {
    throw new PaymentProviderError(
      `A subconta ${account.id} é do provedor ${account.provider}; a API usa ${deps.provider.name}.`,
      409,
    );
  }
  return deps.provider.forAccount!(accountCredentials(deps.secrets, account));
}
