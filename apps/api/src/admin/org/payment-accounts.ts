import { Hono } from "hono";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import type { AdminDeps } from "../context.ts";
import { notYet } from "../stub.ts";

/*
 * Fase 5, frente C (docs/saas/fase-5.md): subcontas da organização, em
 * /api/admin/orgs/:orgId/payment-accounts.
 *
 * - GET  /                    → OrgPaymentAccountsView               (org.read)
 * - POST /                    PaymentAccountInput → { account }      (payments.manage; conta da
 *   organização; já existe ativa → 409; rate limit sensitiveLimit)
 * - GET  /:accountId          → { account: PaymentAccountView }      (org.read; outra org → 404)
 * - POST /:accountId/disable  → { account }                          (payments.manage; conta
 *   escolhida por evento ativo → 409 com os eventos; desativar não apaga no provedor)
 * A frente D monta POST /:accountId/refresh no mesmo prefixo (admin/payment-account-status.ts).
 */
export function orgPaymentAccountRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<OrgAdminEnv>();
  const soon = "Recebimentos";
  app.get("/", requireOrgPermission("org.read"), (c) => notYet(c, soon));
  app.post("/", requireOrgPermission("payments.manage"), (c) => notYet(c, soon));
  app.get("/:accountId{[0-9]+}", requireOrgPermission("org.read"), (c) => notYet(c, soon));
  app.post("/:accountId{[0-9]+}/disable", requireOrgPermission("payments.manage"), (c) =>
    notYet(c, soon),
  );
  return app;
}
