import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { secretsOf } from "../crypto/secret-box.ts";
import { apiError, ERROR_CODES } from "../errors.ts";
import {
  getOrgPaymentAccount,
  activeUserAccount,
  type PaymentAccountRow,
} from "../payment-accounts/store.ts";
import { refreshAccountStatus } from "../payment-accounts/status.ts";
import { isSimulated, PaymentProviderError } from "../payments/index.ts";
import { requireOrgPermission } from "../tenancy/org-access.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv, OrgAdminEnv } from "../tenancy/types.ts";
import { invalid, notFound, readJson, sensitiveLimit, type AdminDeps } from "./context.ts";

/** Situações que o modo simulado deixa escolher no painel (dev e e2e). */
const SimulatedStatus = z.object({
  status: z.enum(["pending", "awaiting_approval", "approved", "rejected"]),
});

/** Só com o provedor simulado e fora de produção (como "Simular pagamento aprovado"). */
const simulationEnabled = (deps: AdminDeps) =>
  isSimulated(deps.provider) && deps.env.NODE_ENV !== "production";

/**
 * Modo simulado: troca a situação cadastral da subconta no provedor de mentira e consulta de
 * novo, pelo mesmo caminho do "Atualizar situação" (grava, avisa por e-mail se mudou).
 */
async function simulate(c: Context, deps: AdminDeps, account: PaymentAccountRow) {
  const parsed = SimulatedStatus.safeParse(await readJson(c));
  if (!parsed.success) return invalid(c, parsed.error.issues);
  if (!isSimulated(deps.provider) || account.provider !== "simulado" || !account.walletId) {
    return notFound(c, "Conta simulada");
  }
  deps.provider.setAccountStatus(account.walletId, parsed.data.status);
  return refresh(c, deps, account);
}

/*
 * Fase 5, frente D (docs/saas/fase-5.md): "Atualizar situação" de uma subconta (consulta o
 * provedor agora; rate limit por usuário). Montadas nos prefixos das rotas da frente C.
 *
 * - POST /api/admin/orgs/:orgId/payment-accounts/:accountId/refresh → { account } (org.read)
 * - POST /api/admin/events/:eventId/payments/my-account/refresh    → { account }
 *   (payments.own_account; sem conta → 404)
 * - POST .../simulate { status } → { account }: só com o provedor simulado fora de produção
 *   (payments.manage na org; payments.own_account no evento). Troca a situação no simulado.
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
        revalidate: deps.revalidate,
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
  if (simulationEnabled(deps)) {
    app.post("/:accountId{[0-9]+}/simulate", requireOrgPermission("payments.manage"), async (c) => {
      const account = await getOrgPaymentAccount(
        deps.db,
        c.get("org").id,
        Number(c.req.param("accountId")),
      );
      if (!account) return notFound(c, "Conta");
      return simulate(c, deps, account);
    });
  }
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
  if (simulationEnabled(deps)) {
    app.post("/my-account/simulate", requirePermission("payments.own_account"), async (c) => {
      const account = await activeUserAccount(deps.db, c.get("event").orgId, c.get("user").id);
      if (!account) return notFound(c, "Conta");
      return simulate(c, deps, account);
    });
  }
  return app;
}
