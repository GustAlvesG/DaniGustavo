import { ERROR_CODES, type ApiError, type ErrorCode } from "@casamento/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export { ERROR_CODES };

/** Monta o corpo de erro padrão `{ error: { code, message, field? } }`. */
export function errorBody(code: ErrorCode | string, message: string, field?: string): ApiError {
  return { error: field ? { code, message, field } : { code, message } };
}

export function apiError(
  c: Context,
  status: ContentfulStatusCode,
  code: ErrorCode | string,
  message: string,
  headers?: Record<string, string>,
) {
  return c.json(errorBody(code, message), status, headers);
}

/**
 * O 404 padrão de rota inexistente. Também usado para evento sem acesso: quem não é do evento
 * recebe exatamente o mesmo corpo, sem saber se ele existe.
 */
export function routeNotFound(c: Context) {
  return apiError(c, 404, ERROR_CODES.notFound, `Rota ${c.req.method} ${c.req.path} não existe.`);
}
