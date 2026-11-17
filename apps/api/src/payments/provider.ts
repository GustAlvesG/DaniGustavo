import { createHmac } from "node:crypto";
import type { PaymentMethod, PaymentProviderName } from "@casamento/shared";
import { safeEqual } from "../middleware/web-key.ts";

/*
 * Abstração do provedor de pagamento. O resto da API só conhece esta interface:
 * trocar "simulado" por "mercadopago" é só configuração (.env), sem mexer nas rotas.
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
  /** Id da cobrança no provedor (order do Mercado Pago). */
  providerOrderId: string;
  /** Nosso publicId, enviado como external_reference. */
  externalReference: string;
  status: ProviderStatus;
  statusDetail: string | null;
  method: PaymentMethod;
  /** Id do pagamento dentro da cobrança (vai para payments.gateway_id). */
  paymentId: string | null;
  amountCents: number;
  /** Só no Pix pendente. */
  pix: { code: string; qrImageBase64: string | null; ticketUrl: string | null } | null;
  raw: unknown;
}

export interface PixChargeInput {
  publicId: string;
  amountCents: number;
  description: string;
  payerEmail: string;
  payerName: string;
  /** Minutos até o Pix vencer (mínimo 30 no Mercado Pago). */
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
  identification?: { type: string; number: string };
}

/** Pedaços da requisição do webhook que entram na validação da assinatura. */
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
  /** Chave pública para tokenizar o cartão no navegador (null no simulado). */
  readonly publicKey: string | null;
  createPix(input: PixChargeInput): Promise<ChargeSnapshot>;
  createCard(input: CardChargeInput): Promise<ChargeSnapshot>;
  getCharge(providerOrderId: string): Promise<ChargeSnapshot>;
  refund(providerOrderId: string): Promise<ChargeSnapshot>;
  /** Cancela uma cobrança pendente (ex.: o Pix, quando o cartão foi aprovado). */
  cancel(providerOrderId: string): Promise<void>;
  /** Assinatura do webhook confere? (false → a rota responde 401) */
  verifyWebhook(req: WebhookRequest): boolean;
  /** Extrai o aviso do corpo/URL do webhook; null se não for um aviso de cobrança. */
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
/* Assinatura no formato do Mercado Pago (usada também pelo simulado)        */
/* ------------------------------------------------------------------------ */

/**
 * Manifesto assinado pelo Mercado Pago: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
 * Pares sem valor ficam de fora (regra da documentação).
 */
export function signatureManifest(parts: {
  dataId?: string;
  requestId?: string;
  ts?: string;
}): string {
  let manifest = "";
  if (parts.dataId) manifest += `id:${parts.dataId};`;
  if (parts.requestId) manifest += `request-id:${parts.requestId};`;
  if (parts.ts) manifest += `ts:${parts.ts};`;
  return manifest;
}

/** Monta o header x-signature (`ts=...,v1=...`): usado pelo simulado e pelos testes. */
export function signWebhook(
  secret: string,
  parts: { dataId: string; requestId: string; ts: string },
): string {
  const v1 = createHmac("sha256", secret).update(signatureManifest(parts)).digest("hex");
  return `ts=${parts.ts},v1=${v1}`;
}

/**
 * Valida x-signature: HMAC-SHA256 hex do manifesto com o segredo do webhook. Versões da
 * documentação pedem o data.id em minúsculas quando é alfanumérico; aceitamos as duas formas.
 */
export function verifySignature(secret: string, req: WebhookRequest): boolean {
  const header = req.header("x-signature");
  if (!secret || !header) return false;
  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((x) => x.trim());
    if (k === "ts") ts = v;
    if (k === "v1") v1 = v;
  }
  if (!ts || !v1) return false;
  const requestId = req.header("x-request-id");
  const dataId = req.query("data.id") ?? bodyDataId(req.body);
  const candidates = new Set([dataId, dataId?.toLowerCase()]);
  for (const id of candidates) {
    const expected = createHmac("sha256", secret)
      .update(signatureManifest({ dataId: id, requestId, ts }))
      .digest("hex");
    if (safeEqual(expected, v1)) return true;
  }
  return false;
}

export function bodyDataId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const data = (body as { data?: { id?: unknown } }).data;
  const id = data?.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : undefined;
}

/** Reais com 2 casas, como o Mercado Pago espera ("50.00"). */
export const toAmount = (cents: number) => (cents / 100).toFixed(2);
/** "50.00" → 5000 */
export const fromAmount = (value: unknown) => Math.round(Number(value ?? 0) * 100);

/** Lê o aviso no formato do Mercado Pago (tópico "order"), usado pelos dois provedores. */
export function parseOrderNotice(req: WebhookRequest): WebhookNotice | null {
  const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as {
    type?: unknown;
    action?: unknown;
    data?: { status_detail?: unknown };
  };
  const type = String(body.type ?? req.query("type") ?? "");
  const providerOrderId = req.query("data.id") ?? bodyDataId(req.body);
  if (type !== "order" || !providerOrderId) return null;
  const action = typeof body.action === "string" ? body.action : "";
  const detail = typeof body.data?.status_detail === "string" ? body.data.status_detail : "";
  // Reenvios do mesmo aviso caem no mesmo id; mudanças de status geram ids novos.
  const eventId = `${type}:${providerOrderId}:${action}:${detail}`.slice(0, 128);
  return { eventId, providerOrderId, type };
}
