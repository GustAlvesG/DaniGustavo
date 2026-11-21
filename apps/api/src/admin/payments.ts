import { Hono } from "hono";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 5, frente C (docs/saas/fase-5.md): recebimento do evento, em
 * /api/admin/events/:eventId/payments.
 *
 * - GET  /             → EventPaymentView                       (payments.read)
 * - PUT  /receiver     EventReceiverUpdate → EventPaymentView   (payments.configure; nunca o
 *   anfitrião; `platform` só o platform admin, 403 para os outros; conta de outra
 *   organização/desativada → 422)
 * - GET  /my-account   → MyPaymentAccountView                   (payments.own_account)
 * - POST /my-account   PaymentAccountInput → { account: PaymentAccountView }
 *   (payments.own_account; já tem conta ativa → 409; rate limit sensitiveLimit)
 * A frente D monta POST /my-account/refresh no mesmo prefixo (admin/payment-account-status.ts).
 */
export function adminPaymentRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<EventAdminEnv>();
  const soon = "Recebimentos";
  app.get("/", requirePermission("payments.read"), (c) => notYet(c, soon));
  app.put("/receiver", requirePermission("payments.configure"), (c) => notYet(c, soon));
  app.get("/my-account", requirePermission("payments.own_account"), (c) => notYet(c, soon));
  app.post("/my-account", requirePermission("payments.own_account"), (c) => notYet(c, soon));
  return app;
}
