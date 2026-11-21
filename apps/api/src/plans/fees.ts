import type { Database } from "@casamento/db";
import { feePercentToBps } from "@casamento/shared";
import type { Env } from "../env.ts";
import { effectiveFeeBps, loadSubscription } from "./service.ts";

/*
 * Fase 6, frente A: taxa da plataforma de uma organização = `fee_bps_override` da assinatura
 * ou `plans.fee_bps` do plano (Cortesia = 0); sem assinatura (legado), `PLATFORM_FEE_PERCENT`
 * do .env (padrão 0,5%). Quem usa: `payment-accounts/resolve.ts` (gravada no pedido).
 */
export async function organizationFeeBps(
  db: Database,
  env: Env,
  organizationId: number,
): Promise<number> {
  const current = await loadSubscription(db, organizationId);
  if (current) return effectiveFeeBps(current);
  return feePercentToBps(env.PLATFORM_FEE_PERCENT ?? 0);
}
