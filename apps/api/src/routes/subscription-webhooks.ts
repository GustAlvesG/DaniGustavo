import type { Database } from "@casamento/db";
import { Hono } from "hono";
import { notYet } from "../admin/stub.ts";
import type { SubscriptionProvider } from "../billing/index.ts";
import type { Env } from "../env.ts";
import type { Mailer } from "../mailer.ts";

/*
 * Fase 6, frente A: POST /api/webhooks/subscriptions — avisos das cobranças da assinatura
 * (conta principal do Asaas, eventos PAYMENT_* com `payment.subscription`). Token no header
 * `asaas-access-token` em tempo constante (401), idempotente por `webhook_events`, status
 * sempre consultado no provedor; pago → assinatura `active`; vencido → `past_due`.
 */
export interface SubscriptionWebhookDeps {
  env: Env;
  db: Database;
  billing: SubscriptionProvider;
  mailer: Mailer;
  now: () => Date;
}

export function subscriptionWebhookRoutes(deps: SubscriptionWebhookDeps) {
  void deps;
  const app = new Hono();
  app.post("/subscriptions", (c) => notYet(c, "Webhook da assinatura"));
  return app;
}
