import { ERROR_CODES, type ApiError, type ErrorCode } from "@casamento/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export { ERROR_CODES };

/** Monta o corpo de erro padrão `{ error: { code, message } }`. */
export function errorBody(code: ErrorCode | string, message: string): ApiError {
  return { error: { code, message } };
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
