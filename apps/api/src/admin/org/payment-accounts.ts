import { PaymentAccountInput } from "@casamento/shared";
import { Hono } from "hono";
import {
  createPaymentAccount,
  disablePaymentAccount,
  listOrgPaymentAccounts,
  paymentAccountView,
} from "../../payment-accounts/service.ts";
import { getOrgPaymentAccount } from "../../payment-accounts/store.ts";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import { invalid, notFound, readJson, sensitiveLimit } from "../context.ts";
import type { AdminDeps } from "../context.ts";
import { handlePaymentErrors } from "../payments.ts";

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
  const { db } = deps;
  const app = new Hono<OrgAdminEnv>();

  app.get("/", requireOrgPermission("org.read"), async (c) =>
    c.json(await listOrgPaymentAccounts(deps, c.get("org").id)),
  );

  app.post(
    "/",
    requireOrgPermission("payments.manage"),
    sensitiveLimit(deps.limiter, "payment-account"),
    (c) =>
      handlePaymentErrors(c, async () => {
        const parsed = PaymentAccountInput.safeParse(await readJson(c));
        if (!parsed.success) return invalid(c, parsed.error.issues);
        const u = c.get("user");
        const row = await createPaymentAccount(deps, {
          orgId: c.get("org").id,
          holder: "organization",
          userId: null,
          createdBy: u.id,
          input: parsed.data,
        });
        return c.json({ account: await paymentAccountView(db, row) }, 201);
      }),
  );

  app.get("/:accountId{[0-9]+}", requireOrgPermission("org.read"), async (c) => {
    const row = await getOrgPaymentAccount(db, c.get("org").id, Number(c.req.param("accountId")));
    if (!row) return notFound(c, "Conta");
    return c.json({ account: await paymentAccountView(db, row) });
  });

  app.post("/:accountId{[0-9]+}/disable", requireOrgPermission("payments.manage"), (c) =>
    handlePaymentErrors(c, async () => {
      const row = await disablePaymentAccount(
        deps,
        c.get("org").id,
        Number(c.req.param("accountId")),
      );
      return c.json({ account: await paymentAccountView(db, row) });
    }),
  );
  return app;
}
