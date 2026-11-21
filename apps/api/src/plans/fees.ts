import type { Database } from "@casamento/db";
import { feePercentToBps } from "@casamento/shared";
import type { Env } from "../env.ts";

/*
 * Fase 6, frente A: taxa da plataforma de uma organização = `fee_bps_override` da assinatura
 * ou `plans.fee_bps` do plano; sem assinatura, `PLATFORM_FEE_PERCENT` do .env (padrão 0,5%).
 * Reservado pela fundação: devolve o valor do .env, como na Fase 5. Quem usa:
 * `payment-accounts/resolve.ts` (frente A também).
 */
export function organizationFeeBps(
  db: Database,
  env: Env,
  organizationId: number,
): Promise<number> {
  void db;
  void organizationId;
  return Promise.resolve(feePercentToBps(env.PLATFORM_FEE_PERCENT));
}
