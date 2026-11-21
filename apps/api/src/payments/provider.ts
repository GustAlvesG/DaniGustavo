import type {
  CompanyType,
  KycSnapshot,
  PaymentAccountInput,
  PaymentAccountPersonType,
  PaymentAccountStatus,
  PaymentMethod,
  PaymentProviderName,
} from "@casamento/shared";
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
  /** Fase 5: repasses (split) da cobrança, como o provedor informa; null/ausente = sem split. */
  split?: SplitSnapshot[] | null;
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
  /** Fase 5: repasse à carteira da plataforma (vazio/ausente = sem split). */
  split?: SplitRule[];
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
  /** Fase 5: o mesmo split da cobrança Pix do pedido. */
  split?: SplitRule[];
}

/* ------------------------------------------------------------------------ */
/* Fase 5: subcontas, situação cadastral e split (docs/saas/fase-5.md)      */
/* ------------------------------------------------------------------------ */

/**
 * Repasse de uma cobrança a outra carteira (Asaas: `split: [{ walletId, percentualValue |
 * fixedValue }]`). O Asaas calcula sobre o valor líquido (depois da taxa dele); percentual com
 * até 4 casas, fixo com 2; nunca a carteira da própria conta que cobra.
 */
export interface SplitRule {
  walletId: string;
  /** Percentual (ex.: 2.5). Use `percent` ou `fixedCents`. */
  percent?: number;
  fixedCents?: number;
}

/** Repasse como o provedor devolve na cobrança. */
export interface SplitSnapshot {
  walletId: string;
  percent: number | null;
  fixedCents: number | null;
  /** Valor efetivo do repasse (centavos), quando o provedor já calculou. */
  totalCents: number | null;
  /** Status do repasse no provedor (minúsculo; ex.: pending, done, refused, cancelled). */
  status: string | null;
}

/**
 * Cadastro de subconta enviado ao provedor (`PaymentAccountInput` do painel + o webhook da
 * conta, que a API monta). Nada disso é gravado além do resumo em `payment_accounts`.
 */
export interface SubaccountInput extends PaymentAccountInput {
  /** Webhook desta subconta (eventos de cobrança e de situação cadastral). */
  webhook: {
    /** BETTER_AUTH_URL + /api/webhooks/payments/accounts/<publicId> */
    url: string;
    /** Token novo (só o hash fica no banco); o provedor manda no header asaas-access-token. */
    authToken: string;
    /** Quem o provedor avisa se o webhook falhar (e-mail da plataforma). */
    email: string;
  };
}

/** O que o provedor devolve ao criar a subconta. A `apiKey` só aparece aqui (guardar cifrada). */
export interface SubaccountCreated {
  providerAccountId: string;
  walletId: string;
  apiKey: string;
  personType: PaymentAccountPersonType;
  companyType: CompanyType | null;
  /** Situação logo depois de criar (o Asaas não devolve: null até a primeira consulta). */
  status: AccountStatusSnapshot | null;
  raw: unknown;
}

/** Credenciais de uma subconta já decifradas (só em memória, durante a chamada). */
export interface AccountCredentials {
  providerAccountId: string;
  walletId: string;
  apiKey: string;
}

/** Situação cadastral normalizada (Asaas: GET /myAccount/status + GET /myAccount/documents). */
export interface AccountStatusSnapshot {
  status: Exclude<PaymentAccountStatus, "disabled">;
  kyc: KycSnapshot;
  raw: unknown;
}

/** Aviso de mudança na situação cadastral (Asaas: eventos ACCOUNT_STATUS_*). */
export interface AccountWebhookNotice {
  eventId: string;
  type: string;
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

  /* Fase 5 (docs/saas/fase-5.md). Opcionais: provedor sem subcontas cobra só na conta principal. */

  /** Conta principal: cria a subconta (Asaas: POST /v3/accounts com o webhook dela). */
  createSubaccount?(input: SubaccountInput): Promise<SubaccountCreated>;
  /**
   * O mesmo provedor agindo pela subconta (Asaas: as chamadas levam a apiKey dela). Cobrança,
   * consulta, reembolso e cancelamento de pedido de subconta passam por aqui.
   */
  forAccount?(creds: AccountCredentials): PaymentProvider;
  /** Só na instância de `forAccount`: situação cadastral e documentos pendentes da subconta. */
  getAccountStatus?(): Promise<AccountStatusSnapshot>;
  /** Aviso de situação cadastral no webhook da subconta; null se não for um. */
  parseAccountWebhook?(req: WebhookRequest): AccountWebhookNotice | null;
}

/** Fase 5: recurso que a frente dona ainda vai implementar (some na integração). */
export function notImplemented(what: string): PaymentProviderError {
  return new PaymentProviderError(`${what} ainda não disponível neste provedor.`, 501);
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

/**
 * Eventos de situação cadastral que fazem a API consultar o status da subconta de novo.
 * TODO(asaas-doc): conferir a lista completa em "Eventos para verificar situação da conta".
 */
export const HANDLED_ACCOUNT_EVENTS = new Set([
  "ACCOUNT_STATUS_BANK_ACCOUNT_INFO_APPROVED",
  "ACCOUNT_STATUS_BANK_ACCOUNT_INFO_AWAITING_APPROVAL",
  "ACCOUNT_STATUS_BANK_ACCOUNT_INFO_PENDING",
  "ACCOUNT_STATUS_BANK_ACCOUNT_INFO_REJECTED",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_APPROVED",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_AWAITING_APPROVAL",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_PENDING",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_REJECTED",
  "ACCOUNT_STATUS_DOCUMENT_APPROVED",
  "ACCOUNT_STATUS_DOCUMENT_AWAITING_APPROVAL",
  "ACCOUNT_STATUS_DOCUMENT_PENDING",
  "ACCOUNT_STATUS_DOCUMENT_REJECTED",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_AWAITING_APPROVAL",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_PENDING",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED",
]);

/** Lê `{ id: "evt_…", event: "ACCOUNT_STATUS_…" }`; null se não for aviso de conta. */
export function parseAccountEvent(req: WebhookRequest): AccountWebhookNotice | null {
  if (typeof req.body !== "object" || req.body === null) return null;
  const body = req.body as { id?: unknown; event?: unknown };
  const eventId = typeof body.id === "string" ? body.id : "";
  const type = typeof body.event === "string" ? body.event : "";
  if (!eventId || !HANDLED_ACCOUNT_EVENTS.has(type)) return null;
  return { eventId: eventId.slice(0, 128), type };
}

/** Reais como número, como o Asaas espera (5000 → 50). */
export const toAmount = (cents: number) => Math.round(cents) / 100;
/** 50 ou "50.00" → 5000 */
export const fromAmount = (value: unknown) => Math.round(Number(value ?? 0) * 100);
