import type { Database } from "@casamento/db";
import type { EventPaymentState } from "@casamento/shared";
import type { SecretBox } from "../crypto/secret-box.ts";
import type { Env } from "../env.ts";
import { notImplemented, type PaymentProvider, type SplitRule } from "../payments/index.ts";
import type { EventCtx } from "../tenancy/types.ts";

/*
 * Fase 5, frente B (docs/saas/fase-5.md): para qual conta vai a cobrança de um evento e por
 * qual conta se fala com o provedor sobre um pedido. Reservado pela fundação.
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
 * `events.payment_receiver` → conta. `organization`: a conta ativa da organização;
 * `host`: `events.receiving_account_id`; `platform`: a conta principal, sem split. Conta
 * ausente/desativada → `no_account`; não aprovada → `not_approved` (o site esconde o
 * pagamento e `POST /orders` responde 409).
 */
export function resolveEventReceiver(
  ev: EventCtx,
  deps: ReceiverDeps,
): Promise<ReceiverResolution> {
  void ev;
  void deps;
  return Promise.reject(notImplemented("Conta recebedora do evento"));
}

/**
 * Provedor para falar de um pedido já criado (consulta, reembolso, cancelamento, conciliação):
 * `gift_orders.payment_account_id` nulo = conta principal; senão, `forAccount` da subconta
 * (mesmo desativada: o pedido antigo continua nela).
 */
export function providerForOrder(
  ev: EventCtx,
  deps: ReceiverDeps,
  order: { paymentAccountId: number | null },
): Promise<PaymentProvider> {
  if (order.paymentAccountId === null) return Promise.resolve(deps.provider);
  void ev;
  return Promise.reject(notImplemented("Pedido de subconta"));
}
