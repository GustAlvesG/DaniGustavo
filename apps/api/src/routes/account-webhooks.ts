import { ERROR_CODES } from "@casamento/shared";
import { Hono } from "hono";
import { secretsOf, tokenMatchesHash } from "../crypto/secret-box.ts";
import { apiError } from "../errors.ts";
import type { OrderDeps } from "../orders/service.ts";
import { providerForAccount } from "../payment-accounts/resolve.ts";
import { handleAccountWebhook } from "../payment-accounts/status.ts";
import { findAccountByPublicId } from "../payment-accounts/store.ts";
import {
  parseAccountEvent,
  WEBHOOK_TOKEN_HEADER,
  type PaymentProvider,
  type WebhookRequest,
} from "../payments/index.ts";
import { handleChargeNotice, readJson } from "./orders.ts";

/** O `public_id` da conta é um ULID (26 caracteres Crockford). */
const PUBLIC_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/*
 * Fase 5 (docs/saas/fase-5.md): webhook de cada subconta, em
 * POST /api/webhooks/payments/accounts/:publicId (a URL vai no cadastro da subconta).
 *
 * - Conta pelo `publicId` (findAccountByPublicId, crossEvent); inexistente → 404.
 * - Token do header asaas-access-token contra `webhook_token_hash` (SHA-256, comparação em tempo
 *   constante) → 401. O token de uma conta não abre o webhook de outra.
 * - Aviso de cobrança: o mesmo caminho do webhook global (handleChargeNotice), consultando a
 *   cobrança pela própria subconta (`forAccount`) e ignorando pedido de outra conta.
 * - Aviso de situação cadastral (ACCOUNT_STATUS_*): `handleAccountWebhook` (frente D).
 * - Idempotente por `webhook_events.event_id`, como o global. Conta desativada continua
 *   recebendo avisos (os pedidos antigos seguem nela).
 */
export function accountWebhookRoutes(deps: OrderDeps) {
  const app = new Hono();
  app.post("/payments/accounts/:publicId", async (c) => {
    const publicId = c.req.param("publicId");
    const account = PUBLIC_ID.test(publicId)
      ? await findAccountByPublicId(deps.db, publicId)
      : null;
    if (!account) return apiError(c, 404, ERROR_CODES.notFound, "Conta não encontrada.");

    const body = await readJson(c);
    const req: WebhookRequest = {
      header: (name) => c.req.header(name),
      query: (name) => c.req.query(name),
      body,
    };
    if (!tokenMatchesHash(req.header(WEBHOOK_TOKEN_HEADER), account.webhookTokenHash)) {
      return apiError(c, 401, ERROR_CODES.unauthorized, "Token do webhook inválido.");
    }

    const accountNotice = (deps.provider.parseAccountWebhook ?? parseAccountEvent)(req);
    if (accountNotice) {
      await handleAccountWebhook({ ...deps, secrets: secretsOf(deps) }, account, accountNotice);
      return c.json({ ok: true });
    }

    const notice = deps.provider.parseWebhook(req);
    if (!notice) return c.json({ ok: true, ignored: true });
    let provider: PaymentProvider;
    try {
      provider = providerForAccount({ provider: deps.provider, secrets: secretsOf(deps) }, account);
    } catch (err) {
      // Conta de outro provedor ou chave ilegível: nada a consultar (o 200 evita reenvios).
      console.warn(
        `[webhook] Subconta ${account.id} sem acesso ao provedor:`,
        err instanceof Error ? err.message : err,
      );
      return c.json({ ok: true, ignored: true });
    }
    return c.json(
      await handleChargeNotice(deps, notice, body, { provider, accountId: account.id }),
    );
  });
  return app;
}
