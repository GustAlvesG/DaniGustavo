import { createHash, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Rotas de escrita que não vêm do site: webhooks (assinatura própria) e Better Auth (sessão).
const EXEMPT_PREFIXES = ["/api/webhooks/", "/api/auth/"];

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Compara em tempo constante (hash antes para não vazar o tamanho). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Escritas em /api/* só com o header `X-Web-Key` igual a WEB_KEY (chamadas servidor a
 * servidor vindas do Next). Exceções: webhooks e Better Auth.
 */
export function webKey(expected: string): MiddlewareHandler {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method) || EXEMPT_PREFIXES.some((p) => c.req.path.startsWith(p))) {
      return next();
    }
    const provided = c.req.header("x-web-key");
    if (!provided || !safeEqual(provided, expected)) {
      return c.json(
        {
          error: "unauthorized",
          message:
            "Chave do site ausente ou inválida. Envie o header X-Web-Key com o valor de WEB_KEY.",
        },
        401,
      );
    }
    return next();
  };
}
