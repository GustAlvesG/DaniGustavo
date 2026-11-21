import { Hono } from "hono";
import { requireOrgPermission } from "../tenancy/org-access.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv, OrgAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 5, frente D (docs/saas/fase-5.md): "Atualizar situação" de uma subconta (consulta o
 * provedor agora; rate limit por usuário). Montadas nos prefixos das rotas da frente C.
 *
 * - POST /api/admin/orgs/:orgId/payment-accounts/:accountId/refresh → { account } (org.read)
 * - POST /api/admin/events/:eventId/payments/my-account/refresh    → { account }
 *   (payments.own_account; sem conta → 404)
 */
export function orgAccountStatusRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<OrgAdminEnv>();
  app.post("/:accountId{[0-9]+}/refresh", requireOrgPermission("org.read"), (c) =>
    notYet(c, "Situação da conta"),
  );
  return app;
}

export function eventAccountStatusRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<EventAdminEnv>();
  app.post("/my-account/refresh", requirePermission("payments.own_account"), (c) =>
    notYet(c, "Situação da conta"),
  );
  return app;
}
