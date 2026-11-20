import { z } from "zod";

/** Códigos de erro estáveis da API. O front decide o comportamento pelo código, não pela mensagem. */
export const ERROR_CODES = {
  unauthorized: "unauthorized",
  notFound: "not_found",
  invalidRequest: "invalid_request",
  /** Conflito com o que já existe (endereço ou domínio em uso, convite já aceito, conta existente). */
  conflict: "conflict",
  rsvpClosed: "rsvp_closed",
  /** Não há cotas suficientes do presente (vendidas ou reservadas). */
  giftUnavailable: "gift_unavailable",
  /** O pedido não está mais pendente (pago, expirado...). */
  orderNotPending: "order_not_pending",
  /** O provedor de pagamento falhou ou recusou a cobrança. */
  paymentFailed: "payment_failed",
  tooManyRequests: "too_many_requests",
  internalError: "internal_error",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Formato de todo erro da API: `{ error: { code, message, field? } }`. A mensagem já vem em pt-BR;
 * `field` (opcional) aponta o campo do formulário culpado, quando a API sabe qual é.
 */
export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    field: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
