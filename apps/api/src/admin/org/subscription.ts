import { SubscriptionChangeInput } from "@casamento/shared";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { isSimulatedBilling, SubscriptionProviderError } from "../../billing/index.ts";
import { apiError, ERROR_CODES, errorBody } from "../../errors.ts";
import { PlanLimitError, planLimitResponse } from "../../plans/limits.ts";
import {
  computeUsage,
  loadSubscription,
  subscriptionView,
  type OrgSubscription,
} from "../../plans/service.ts";
import {
  cancelPlan,
  changePlan,
  handleSubscriptionNotice,
  SubscriptionError,
  type SubscriptionDeps,
} from "../../plans/subscriptions.ts";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import { invalid, readJson, type AdminDeps } from "../context.ts";

/*
 * Fase 6, frente A (docs/saas/fase-6.md): assinatura e uso da organização, em
 * /api/admin/orgs/:orgId.
 *
 * - GET  /subscription         → SubscriptionView (org.read; sem assinatura → 404)
 * - POST /subscription         SubscriptionChangeInput → SubscriptionChangeResult (billing.manage;
 *   plano interno/inexistente → 422; limite do plano novo menor que o uso atual → 409 plan_limit)
 * - POST /subscription/cancel  → SubscriptionView (billing.manage; vale até o fim do período)
 * - POST /subscription/simulate { outcome: "paid" | "overdue" } → SubscriptionView (só com o
 *   provedor simulado e fora de produção: o botão "Simular pagamento", pelo caminho do webhook)
 * - GET  /usage                → UsageView                                (org.read)
 * Estas rotas passam pelo orgSubscriptionGate mesmo inadimplente (é por onde se paga).
 */

/** Falhas da assinatura → resposta HTTP (regra 404/409/422, limite 409, provedor 502). */
export async function subscriptionErrors(c: Context, fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return planLimitResponse(c, { ok: false, kind: err.kind, limit: err.limit });
    }
    if (err instanceof SubscriptionError) {
      const code =
        err.status === 404
          ? ERROR_CODES.notFound
          : err.status === 409
            ? ERROR_CODES.conflict
            : ERROR_CODES.invalidRequest;
      return c.json(errorBody(code, err.message, err.field), err.status);
    }
    if (err instanceof SubscriptionProviderError) {
      console.error("[assinaturas] Falha no provedor:", err.message);
      return apiError(
        c,
        502,
        ERROR_CODES.paymentFailed,
        "O provedor de pagamento não respondeu como esperado. Tente de novo em alguns minutos.",
      );
    }
    throw err;
  }
}

const SimulateInput = z.object({
  outcome: z.enum(["paid", "overdue"], { error: "Escolha pago ou vencido." }),
});

export function orgSubscriptionRoutes(deps: AdminDeps) {
  const { db, billing } = deps;
  const sdeps: SubscriptionDeps = {
    env: deps.env,
    db,
    billing,
    mailer: deps.mailer,
    now: deps.now,
  };
  const app = new Hono<OrgAdminEnv>();
  const canSimulate = isSimulatedBilling(billing) && deps.env.NODE_ENV !== "production";
  const view = async (current: OrgSubscription) => ({
    ...(await subscriptionView(db, current, deps.now())),
    canSimulate,
  });

  app.get("/subscription", requireOrgPermission("org.read"), async (c) => {
    const current = await loadSubscription(db, c.get("org").id);
    if (!current) {
      return apiError(c, 404, ERROR_CODES.notFound, "Esta organização ainda não tem assinatura.");
    }
    return c.json(await view(current));
  });

  app.post("/subscription", requireOrgPermission("billing.manage"), async (c) => {
    const parsed = SubscriptionChangeInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const org = c.get("org");
    const user = c.get("user");
    return subscriptionErrors(c, async () => {
      const result = await changePlan(
        sdeps,
        { org: { id: org.id, name: org.name }, payer: { name: user.name, email: user.email } },
        parsed.data,
      );
      return c.json({ ...result, subscription: { ...result.subscription, canSimulate } });
    });
  });

  app.post("/subscription/cancel", requireOrgPermission("billing.manage"), (c) =>
    subscriptionErrors(c, async () =>
      c.json({ ...(await cancelPlan(sdeps, c.get("org").id)), canSimulate }),
    ),
  );

  if (isSimulatedBilling(billing) && canSimulate) {
    app.post("/subscription/simulate", requireOrgPermission("billing.manage"), async (c) => {
      const parsed = SimulateInput.safeParse(await readJson(c));
      if (!parsed.success) return invalid(c, parsed.error.issues);
      const orgId = c.get("org").id;
      const current = await loadSubscription(db, orgId);
      const remote = current?.sub.providerSubscriptionId;
      const hook = remote ? billing.simulate(remote, parsed.data.outcome, deps.now()) : null;
      const notice = hook
        ? billing.parseWebhook({
            header: (name) => hook.headers[name],
            query: () => undefined,
            body: hook.body,
          })
        : null;
      if (!hook || !notice) {
        return apiError(c, 404, ERROR_CODES.notFound, "Nenhuma cobrança em aberto para simular.");
      }
      await handleSubscriptionNotice(sdeps, notice, hook.body);
      return c.json(await view((await loadSubscription(db, orgId))!));
    });
  }

  app.get("/usage", requireOrgPermission("org.read"), async (c) =>
    c.json(await computeUsage(db, c.get("org").id)),
  );
  return app;
}
