import { z } from "zod";

/** Códigos de erro estáveis da API. O front decide o comportamento pelo código, não pela mensagem. */
export const ERROR_CODES = {
  unauthorized: "unauthorized",
  notFound: "not_found",
  invalidRequest: "invalid_request",
  rsvpClosed: "rsvp_closed",
  tooManyRequests: "too_many_requests",
  internalError: "internal_error",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Formato de todo erro da API: `{ error: { code, message } }`. A mensagem já vem em pt-BR. */
export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
