import { Hono } from "hono";
import { notYet } from "../admin/stub.ts";
import type { OrderDeps } from "../orders/service.ts";

/*
 * Fase 5, frente B (docs/saas/fase-5.md): webhook de cada subconta, em
 * POST /api/webhooks/payments/accounts/:publicId (a URL vai no cadastro da subconta).
 *
 * - Conta pelo `publicId` (findAccountByPublicId, crossEvent); inexistente → 404.
 * - Token do header asaas-access-token contra `webhook_token_hash` (tokenMatchesHash) → 401.
 * - Aviso de cobrança (parseWebhook): mesmo caminho do webhook global, mas consultando a
 *   cobrança pela subconta (`provider.forAccount`) e conferindo que o pedido é dela.
 * - Aviso de situação cadastral (parseAccountWebhook): `handleAccountWebhook` da frente D.
 * - Idempotente por `webhook_events.event_id`, como o global.
 */
export function accountWebhookRoutes(deps: OrderDeps) {
  void deps;
  const app = new Hono();
  app.post("/payments/accounts/:publicId", (c) => notYet(c, "Webhook da subconta"));
  return app;
}
