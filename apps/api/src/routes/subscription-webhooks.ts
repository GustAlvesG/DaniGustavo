import type { Database } from "@casamento/db";
import { Hono } from "hono";
import {
  SubscriptionWebhookTokenError,
  type SubscriptionProvider,
  type SubscriptionWebhookNotice,
} from "../billing/index.ts";
import type { Env } from "../env.ts";
import { apiError, ERROR_CODES } from "../errors.ts";
import type { Mailer } from "../mailer.ts";
import { handleSubscriptionNotice } from "../plans/subscriptions.ts";

/*
 * Fase 6, frente A: POST /api/webhooks/subscriptions — avisos das cobranças da assinatura
 * (conta principal do Asaas, eventos PAYMENT_* com `payment.subscription`). Token no header
 * `asaas-access-token` em tempo constante (401), idempotente por `webhook_events`, status
 * sempre consultado no provedor; pago → assinatura `active`; vencido → `past_due`. Falha ao
 * processar → 500 (o provedor reenvia).
 */
export interface SubscriptionWebhookDeps {
  env: Env;
  db: Database;
  billing: SubscriptionProvider;
  mailer: Mailer;
  now: () => Date;
}

export function subscriptionWebhookRoutes(deps: SubscriptionWebhookDeps) {
  const app = new Hono();
  app.post("/subscriptions", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    let notice: SubscriptionWebhookNotice | null;
    try {
      notice = deps.billing.parseWebhook({
        header: (name) => c.req.header(name),
        query: (name) => c.req.query(name),
        body,
      });
    } catch (err) {
      if (err instanceof SubscriptionWebhookTokenError) {
        return apiError(c, 401, ERROR_CODES.unauthorized, "Token do webhook inválido.");
      }
      throw err;
    }
    if (!notice) return c.json({ ok: true, ignored: true });
    try {
      return c.json(await handleSubscriptionNotice(deps, notice, body));
    } catch (err) {
      console.error("[assinaturas] Falha ao processar o webhook:", err);
      return apiError(
        c,
        500,
        ERROR_CODES.internalError,
        "Falha ao processar o aviso da assinatura. O provedor vai reenviar.",
      );
    }
  });
  return app;
}
