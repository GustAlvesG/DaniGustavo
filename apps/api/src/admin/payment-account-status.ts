import type { Context } from "hono";
import { Hono } from "hono";
import { secretsOf } from "../crypto/secret-box.ts";
import { apiError, ERROR_CODES } from "../errors.ts";
import {
  getOrgPaymentAccount,
  activeUserAccount,
  type PaymentAccountRow,
} from "../payment-accounts/store.ts";
import { refreshAccountStatus } from "../payment-accounts/status.ts";
import { PaymentProviderError } from "../payments/index.ts";
import { requireOrgPermission } from "../tenancy/org-access.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv, OrgAdminEnv } from "../tenancy/types.ts";
import { notFound, sensitiveLimit, type AdminDeps } from "./context.ts";

/*
 * Fase 5, frente D (docs/saas/fase-5.md): "Atualizar situação" de uma subconta (consulta o
 * provedor agora; rate limit por usuário). Montadas nos prefixos das rotas da frente C.
 *
 * - POST /api/admin/orgs/:orgId/payment-accounts/:accountId/refresh → { account } (org.read)
 * - POST /api/admin/events/:eventId/payments/my-account/refresh    → { account }
 *   (payments.own_account; sem conta → 404)
 */
async function refresh(c: Context, deps: AdminDeps, account: PaymentAccountRow) {
  try {
    const view = await refreshAccountStatus(
      {
        env: deps.env,
        db: deps.db,
        provider: deps.provider,
        secrets: secretsOf(deps),
        mailer: deps.mailer,
        now: deps.now,
      },
      account,
    );
    return c.json({ account: view });
  } catch (err) {
    if (err instanceof PaymentProviderError) {
      console.error(`[contas] Consulta da conta ${account.id} falhou: ${err.message}`);
      return apiError(
        c,
        502,
        ERROR_CODES.paymentFailed,
        "Não foi possível consultar o provedor de pagamento agora. Tente de novo em instantes.",
      );
    }
    throw err;
  }
}

export function orgAccountStatusRoutes(deps: AdminDeps) {
  const app = new Hono<OrgAdminEnv>();
  app.post(
    "/:accountId{[0-9]+}/refresh",
    requireOrgPermission("org.read"),
    sensitiveLimit(deps.limiter, "conta-situacao"),
    async (c) => {
      const account = await getOrgPaymentAccount(
        deps.db,
        c.get("org").id,
        Number(c.req.param("accountId")),
      );
      if (!account) return notFound(c, "Conta");
      return refresh(c, deps, account);
    },
  );
  return app;
}

export function eventAccountStatusRoutes(deps: AdminDeps) {
  const app = new Hono<EventAdminEnv>();
  app.post(
    "/my-account/refresh",
    requirePermission("payments.own_account"),
    sensitiveLimit(deps.limiter, "conta-situacao"),
    async (c) => {
      const account = await activeUserAccount(deps.db, c.get("event").orgId, c.get("user").id);
      if (!account) return notFound(c, "Conta");
      return refresh(c, deps, account);
    },
  );
  return app;
}
