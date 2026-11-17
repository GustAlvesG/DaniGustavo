import type { PaymentMethod, PaymentProviderName } from "@casamento/shared";
import { safeEqual } from "../middleware/web-key.ts";

/*
 * Abstração do provedor de pagamento. O resto da API só conhece esta interface:
 * trocar "simulado" por "asaas" é só configuração (.env), sem mexer nas rotas.
 */

/** Situação normalizada de uma cobrança no provedor. */
export type ProviderStatus =
  | "pending" // aguardando o pagamento (Pix gerado, cartão em análise)
  | "approved" // dinheiro confirmado
  | "rejected" // recusado (cartão) ou falhou
  | "expired" // Pix venceu sem pagamento
  | "cancelled" // cancelado por nós
  | "refunded"; // devolvido ao convidado

/** Foto de uma cobrança no provedor, já no nosso vocabulário. */
export interface ChargeSnapshot {
  /** Id da cobrança no provedor (pay_… no Asaas). */
  providerOrderId: string;
  /** Nosso publicId, enviado como externalReference. */
  externalReference: string;
  status: ProviderStatus;
  statusDetail: string | null;
  method: PaymentMethod;
  /** Id do pagamento (vai para payments.gateway_id). */
  paymentId: string | null;
  amountCents: number;
  /** Só no Pix pendente. */
  pix: { code: string; qrImageBase64: string | null; ticketUrl: string | null } | null;
  /** Página hospedada do provedor onde a pessoa paga (fatura do Asaas), se houver. */
  checkoutUrl?: string | null;
  raw: unknown;
}

export interface PixChargeInput {
  publicId: string;
  amountCents: number;
  description: string;
  payerEmail: string;
  payerName: string;
  /** Só dígitos. Exigido pelo Asaas; nunca vai para o banco nem para os logs. */
  payerCpf?: string;
  /** Minutos até o pedido vencer (a API cancela a cobrança no provedor depois disso). */
  expiresInMinutes: number;
}

export interface CardChargeInput {
  publicId: string;
  amountCents: number;
  description: string;
  payerEmail: string;
  token: string;
  paymentMethodId: string;
  paymentType: "credit_card" | "debit_card";
  installments: number;
}

/** Cartão na página hospedada do provedor: os dados do cartão nunca passam por nós. */
export interface CardCheckoutInput {
  publicId: string;
  amountCents: number;
  description: string;
  /** Cobrança Pix do pedido: o Asaas reaproveita o cliente (e o CPF) dela. */
  baseChargeId: string | null;
  /** Para onde o provedor manda a pessoa depois de pagar (null: sem redirecionamento). */
  successUrl: string | null;
}

/** Pedaços da requisição do webhook que entram na validação. */
export interface WebhookRequest {
  header(name: string): string | undefined;
  query(name: string): string | undefined;
  body: unknown;
}

/** O que o webhook avisou: qual cobrança mudou. O status em si é sempre consultado no provedor. */
export interface WebhookNotice {
  /** Id único do evento (idempotência em webhook_events). */
  eventId: string;
  /** Id da cobrança que mudou. */
  providerOrderId: string;
  type: string;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /** Chave pública para tokenizar o cartão no navegador (nenhum provedor atual usa: null). */
  readonly publicKey: string | null;
  /** O provedor exige o CPF de quem paga para gerar a cobrança (Asaas). */
  readonly requiresCpf?: boolean;
  createPix(input: PixChargeInput): Promise<ChargeSnapshot>;
  createCard(input: CardChargeInput): Promise<ChargeSnapshot>;
  /**
   * Cobrança de cartão paga na página hospedada do provedor. Quem implementa não aceita
   * `createCard` (o cartão nunca passa pela API).
   */
  createCardCheckout?(input: CardCheckoutInput): Promise<ChargeSnapshot & { checkoutUrl: string }>;
  /** Todas as cobranças de um pedido (Pix e cartão), pelo nosso publicId. */
  listCharges?(externalReference: string): Promise<ChargeSnapshot[]>;
  getCharge(providerOrderId: string): Promise<ChargeSnapshot>;
  refund(providerOrderId: string): Promise<ChargeSnapshot>;
  /** Cancela uma cobrança pendente (ex.: o Pix, quando o cartão foi aprovado). */
  cancel(providerOrderId: string): Promise<void>;
  /** O webhook veio mesmo do provedor? (false → a rota responde 401) */
  verifyWebhook(req: WebhookRequest): boolean;
  /** Extrai o aviso do corpo do webhook; null se não for um aviso que interessa. */
  parseWebhook(req: WebhookRequest): WebhookNotice | null;
}

/** Erro de comunicação ou recusa técnica do provedor (não é cartão recusado). */
export class PaymentProviderError extends Error {
  readonly status?: number;
  readonly details?: unknown;
  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "PaymentProviderError";
    this.status = status;
    this.details = details;
  }
}

/* ------------------------------------------------------------------------ */
/* Webhook no formato do Asaas (usado também pelo simulado)                  */
/* ------------------------------------------------------------------------ */

/** Header em que o Asaas manda o token cadastrado junto com o webhook. */
export const WEBHOOK_TOKEN_HEADER = "asaas-access-token";

/** Confere o token do webhook em tempo constante. Token vazio nunca confere. */
export function verifyWebhookToken(expected: string, req: WebhookRequest): boolean {
  const got = req.header(WEBHOOK_TOKEN_HEADER);
  if (!expected || !got) return false;
  return safeEqual(got, expected);
}

/**
 * Eventos de cobrança que podem mudar o pedido. Os outros (criada, visualizada, split…)
 * são respondidos com 200 e ignorados, sem consultar o provedor.
 */
export const HANDLED_PAYMENT_EVENTS = new Set([
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_REFUND_DENIED",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_AWAITING_RISK_ANALYSIS",
  "PAYMENT_APPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
]);

/**
 * Lê o aviso no formato do Asaas: `{ id: "evt_…", event: "PAYMENT_RECEIVED", payment: { id } }`.
 * O `id` do evento é a chave de idempotência (a entrega é "pelo menos uma vez").
 */
export function parsePaymentEvent(req: WebhookRequest): WebhookNotice | null {
  if (typeof req.body !== "object" || req.body === null) return null;
  const body = req.body as { id?: unknown; event?: unknown; payment?: { id?: unknown } };
  const eventId = typeof body.id === "string" ? body.id : "";
  const type = typeof body.event === "string" ? body.event : "";
  const paymentId = typeof body.payment?.id === "string" ? body.payment.id : "";
  if (!eventId || !paymentId || !HANDLED_PAYMENT_EVENTS.has(type)) return null;
  return { eventId: eventId.slice(0, 128), providerOrderId: paymentId, type };
}

/** Reais como número, como o Asaas espera (5000 → 50). */
export const toAmount = (cents: number) => Math.round(cents) / 100;
/** 50 ou "50.00" → 5000 */
export const fromAmount = (value: unknown) => Math.round(Number(value ?? 0) * 100);
