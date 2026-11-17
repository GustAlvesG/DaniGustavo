import { randomUUID } from "node:crypto";
import {
  fromAmount,
  parseOrderNotice,
  PaymentProviderError,
  toAmount,
  verifySignature,
  type CardChargeInput,
  type ChargeSnapshot,
  type PaymentProvider,
  type PixChargeInput,
  type ProviderStatus,
  type WebhookRequest,
} from "./provider.ts";

/*
 * Mercado Pago, Checkout Transparente via **Orders API** (`/v1/orders`), que a documentação
 * atual indica para integrações novas (a Payments API aparece como "legacy"). Usamos `fetch`
 * direto, sem o SDK de Node: são quatro chamadas REST e assim os testes trocam o `fetch`
 * por respostas gravadas. O cartão é tokenizado no navegador pelo SDK JS oficial; aqui só
 * chega o token.
 *
 * Docs: developers/pt/docs/checkout-api-orders (Pix, cartões, status da order, reembolsos,
 * notificações).
 */

export interface MercadoPagoOptions {
  accessToken: string;
  publicKey: string;
  webhookSecret: string;
  apiUrl?: string;
  fetch?: typeof fetch;
}

/** Partes da order do Mercado Pago que usamos. */
export interface MpOrder {
  id: string;
  status: string;
  status_detail?: string;
  external_reference?: string;
  total_amount?: string;
  transactions?: {
    payments?: {
      id?: string;
      status?: string;
      status_detail?: string;
      amount?: string;
      payment_method?: {
        id?: string;
        type?: string;
        qr_code?: string;
        qr_code_base64?: string;
        ticket_url?: string;
      };
    }[];
  };
}

/**
 * Status da order → nosso vocabulário. Tabela "Status da order" da documentação:
 * processed/accredited = pago; action_required, processing e created = aguardando;
 * failed = recusado (ou expirado); canceled = cancelado ou expirado; refunded = devolvido.
 */
export function mapOrderStatus(status: string, detail: string | undefined): ProviderStatus {
  switch (status) {
    case "processed":
      return "approved"; // inclui partially_refunded: o presente continua dado
    case "refunded":
      return "refunded";
    case "charged_back":
      return detail === "reimbursed" ? "refunded" : "approved";
    case "failed":
      return detail === "expired" ? "expired" : "rejected";
    case "canceled":
    case "cancelled":
      return detail === "expired" ? "expired" : "cancelled";
    default:
      return "pending"; // created, processing, action_required
  }
}

export function snapshotFromOrder(order: MpOrder): ChargeSnapshot {
  const payment = order.transactions?.payments?.[0];
  const pm = payment?.payment_method;
  const status = mapOrderStatus(order.status, order.status_detail);
  const isPix = pm?.id === "pix" || pm?.type === "bank_transfer";
  return {
    providerOrderId: order.id,
    externalReference: order.external_reference ?? "",
    status,
    statusDetail: order.status_detail ?? payment?.status_detail ?? null,
    method: isPix ? "pix" : "card",
    paymentId: payment?.id ?? null,
    amountCents: fromAmount(payment?.amount ?? order.total_amount),
    pix:
      isPix && status === "pending" && pm?.qr_code
        ? {
            code: pm.qr_code,
            qrImageBase64: pm.qr_code_base64 ?? null,
            ticketUrl: pm.ticket_url ?? null,
          }
        : null,
    raw: order,
  };
}

export function createMercadoPagoProvider(opts: MercadoPagoOptions): PaymentProvider {
  const base = (opts.apiUrl ?? "https://api.mercadopago.com").replace(/\/+$/, "");
  const doFetch = opts.fetch ?? fetch;

  async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<MpOrder> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${opts.accessToken}`,
      accept: "application/json",
    };
    if (method === "POST") {
      headers["content-type"] = "application/json";
      // Evita cobrança dupla se a mesma requisição for repetida.
      headers["x-idempotency-key"] = randomUUID();
    }
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new PaymentProviderError("Mercado Pago não respondeu.", 0, String(err));
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    if (!res.ok) {
      // Cartão recusado em processing_mode automatic volta como order "failed" (HTTP 4xx
      // com a order no corpo em algumas respostas): se tiver id e status, trate como snapshot.
      const maybe = (json as { data?: MpOrder } | MpOrder | undefined) ?? undefined;
      const order = (maybe && "data" in maybe ? maybe.data : maybe) as MpOrder | undefined;
      if (order?.id && order.status) return order;
      throw new PaymentProviderError(
        `Mercado Pago respondeu ${res.status} em ${method} ${path}.`,
        res.status,
        json,
      );
    }
    return json as MpOrder;
  }

  return {
    name: "mercadopago",
    publicKey: opts.publicKey,

    async createPix(input: PixChargeInput) {
      const amount = toAmount(input.amountCents);
      const order = await call("POST", "/v1/orders", {
        type: "online",
        processing_mode: "automatic",
        total_amount: amount,
        external_reference: input.publicId,
        description: input.description,
        payer: { email: input.payerEmail, first_name: input.payerName.split(" ")[0] },
        transactions: {
          payments: [
            {
              amount,
              payment_method: { id: "pix", type: "bank_transfer" },
              // Duração ISO 8601; o mínimo aceito é 30 minutos.
              expiration_time: `PT${Math.max(30, input.expiresInMinutes)}M`,
            },
          ],
        },
      });
      return snapshotFromOrder(order);
    },

    async createCard(input: CardChargeInput) {
      const amount = toAmount(input.amountCents);
      const order = await call("POST", "/v1/orders", {
        type: "online",
        processing_mode: "automatic",
        total_amount: amount,
        external_reference: input.publicId,
        description: input.description,
        payer: {
          email: input.payerEmail,
          ...(input.identification ? { identification: input.identification } : {}),
        },
        transactions: {
          payments: [
            {
              amount,
              payment_method: {
                id: input.paymentMethodId,
                type: input.paymentType,
                token: input.token,
                installments: input.installments,
              },
            },
          ],
        },
      });
      return snapshotFromOrder(order);
    },

    async getCharge(id) {
      return snapshotFromOrder(await call("GET", `/v1/orders/${encodeURIComponent(id)}`));
    },

    async refund(id) {
      // Corpo vazio = reembolso total.
      return snapshotFromOrder(
        await call("POST", `/v1/orders/${encodeURIComponent(id)}/refund`, undefined),
      );
    },

    async cancel(id) {
      await call("POST", `/v1/orders/${encodeURIComponent(id)}/cancel`, undefined);
    },

    verifyWebhook(req: WebhookRequest) {
      return verifySignature(opts.webhookSecret, req);
    },

    parseWebhook: parseOrderNotice,
  };
}
