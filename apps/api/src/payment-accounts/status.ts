import type { Database } from "@casamento/db";
import type { PaymentAccountView } from "@casamento/shared";
import type { SecretBox } from "../crypto/secret-box.ts";
import type { Env } from "../env.ts";
import type { Mailer } from "../mailer.ts";
import {
  notImplemented,
  type AccountWebhookNotice,
  type PaymentProvider,
} from "../payments/index.ts";
import type { PaymentAccountRow } from "./store.ts";

/*
 * Fase 5, frente D (docs/saas/fase-5.md): situação cadastral (KYC) das subcontas. Consulta o
 * provedor (`forAccount(...).getAccountStatus()`), grava `status`/`kyc`/`status_checked_at`
 * (e `approved_at` na primeira aprovação) e avisa quem cadastrou quando muda. Reservado pela
 * fundação.
 */

export interface AccountStatusDeps {
  env: Env;
  db: Database;
  provider: PaymentProvider;
  secrets: SecretBox;
  mailer: Mailer;
  now: () => Date;
}

/** Consulta o provedor e grava a situação da conta; devolve a view atualizada. */
export function refreshAccountStatus(
  deps: AccountStatusDeps,
  account: PaymentAccountRow,
): Promise<PaymentAccountView> {
  void deps;
  void account;
  return Promise.reject(notImplemented("Situação cadastral da subconta"));
}

/** Aviso ACCOUNT_STATUS_* chegou no webhook da conta: idempotente e consulta o provedor. */
export function handleAccountWebhook(
  deps: AccountStatusDeps,
  account: PaymentAccountRow,
  notice: AccountWebhookNotice,
): Promise<void> {
  void deps;
  void account;
  void notice;
  return Promise.reject(notImplemented("Aviso de situação cadastral"));
}

/** Rotina: contas não aprovadas nem desativadas, consultadas de tempos em tempos (crossEvent). */
export function refreshPendingAccounts(deps: AccountStatusDeps): Promise<number> {
  void deps;
  return Promise.resolve(0);
}
