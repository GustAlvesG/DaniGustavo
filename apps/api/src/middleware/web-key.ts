import { createHash, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { apiError, ERROR_CODES } from "../errors.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Rotas de escrita que não vêm do site: webhooks (assinatura própria), Better Auth e painel
// (sessão por cookie; o painel nunca recebe a WEB_KEY), inclusive o aceite de convite da equipe,
// que o painel chama antes de haver sessão (Fase 3; tem limite por IP e confere a origem).
const EXEMPT_PREFIXES = ["/api/webhooks/", "/api/auth/", "/api/admin/", "/api/team-invites/"];

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Compara em tempo constante (hash antes para não vazar o tamanho). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Escritas em /api/* só com o header `X-Web-Key` igual a WEB_KEY (chamadas servidor a
 * servidor vindas do Next). Exceções: webhooks, Better Auth, painel (/api/admin, com sessão) e
 * aceite de convite da equipe (/api/team-invites).
 */
export function webKey(expected: string): MiddlewareHandler {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method) || EXEMPT_PREFIXES.some((p) => c.req.path.startsWith(p))) {
      return next();
    }
    const provided = c.req.header("x-web-key");
    if (!provided || !safeEqual(provided, expected)) {
      return apiError(
        c,
        401,
        ERROR_CODES.unauthorized,
        "Chave do site ausente ou inválida. Envie o header X-Web-Key com o valor de WEB_KEY.",
      );
    }
    return next();
  };
}
