import { createHmac } from "node:crypto";
import { eq, giftOrders, gifts, inArray, payments, webhookEvents } from "@casamento/db";
import { OrderView } from "@casamento/shared";
import { afterAll, describe, expect, it } from "vitest";
import { parseEnv } from "../src/env.ts";
import {
  createMercadoPagoProvider,
  createPaymentProvider,
  mapOrderStatus,
  verifySignature,
  type WebhookRequest,
} from "../src/payments/index.ts";
import { TEST_WEB_KEY, testApp } from "./helpers.ts";

// Respostas gravadas no formato da documentação da Orders API (/v1/orders).

const SECRET = "segredo-do-webhook-de-teste";

/** Corpo enviado ao Mercado Pago (só os campos que os testes conferem). */
type SentBody = {
  payer: Record<string, unknown>;
  transactions: { payments: { payment_method: unknown }[] };
} & Record<string, unknown>;

const pixOrder = (
  id: string,
  ref: string,
  status = "action_required",
  detail = "waiting_transfer",
) => ({
  id,
  type: "online",
  external_reference: ref,
  total_amount: "100.00",
  status,
  status_detail: detail,
  processing_mode: "automatic",
  transactions: {
    payments: [
      {
        id: `PAY${id}`,
        amount: "100.00",
        status,
        status_detail: detail,
        payment_method: {
          id: "pix",
          type: "bank_transfer",
          ticket_url: "https://www.mercadopago.com.br/sandbox/payments/123/ticket",
          qr_code: "00020126580014br.gov.bcb.pix0136teste",
          qr_code_base64: "iVBORw0KGgoAAAANSUhEUg==",
        },
      },
    ],
  },
});

type Call = { url: string; init: RequestInit };

function mockFetch(responder: (call: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fn = (input: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    const { status = 200, body } = responder(call);
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return { fetch: fn as typeof fetch, calls };
}

const provider = (f: typeof fetch) =>
  createMercadoPagoProvider({
    accessToken: "TEST-token",
    publicKey: "TEST-public",
    webhookSecret: SECRET,
    fetch: f,
  });

function signedRequest(dataId: string, secret = SECRET, requestId = "req-123"): WebhookRequest {
  const ts = "1742505638683";
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  const headers: Record<string, string> = {
    "x-signature": `ts=${ts},v1=${v1}`,
    "x-request-id": requestId,
  };
  return {
    header: (n) => headers[n.toLowerCase()],
    query: (n) => (n === "data.id" ? dataId : n === "type" ? "order" : undefined),
    body: { type: "order", action: "order.processed", data: { id: dataId } },
  };
}

describe("Mercado Pago: cobranças", () => {
  it("cria o Pix pela Orders API com expiração de 30 min e idempotência", async () => {
    const m = mockFetch(() => ({ status: 201, body: pixOrder("ORD01", "PUB1") }));
    const charge = await provider(m.fetch).createPix({
      publicId: "PUB1",
      amountCents: 10000,
      description: "Presente: Cafeteira",
      payerEmail: "ana@exemplo.com",
      payerName: "Ana Teste",
      expiresInMinutes: 30,
    });
    const call = m.calls[0]!;
    expect(call.url).toBe("https://api.mercadopago.com/v1/orders");
    const headers = call.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer TEST-token");
    expect(headers["x-idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    const body = JSON.parse(String(call.init.body)) as SentBody;
    expect(body).toMatchObject({
      type: "online",
      processing_mode: "automatic",
      total_amount: "100.00",
      external_reference: "PUB1",
      payer: { email: "ana@exemplo.com" },
    });
    expect(body.transactions.payments[0]).toEqual({
      amount: "100.00",
      payment_method: { id: "pix", type: "bank_transfer" },
      expiration_time: "PT30M",
    });
    expect(charge).toMatchObject({
      providerOrderId: "ORD01",
      externalReference: "PUB1",
      status: "pending",
      method: "pix",
      amountCents: 10000,
      pix: {
        code: "00020126580014br.gov.bcb.pix0136teste",
        qrImageBase64: "iVBORw0KGgoAAAANSUhEUg==",
      },
    });
  });

  it("cartão: manda só o token e lê a aprovação", async () => {
    const m = mockFetch(() => ({
      status: 201,
      body: {
        id: "ORD02",
        external_reference: "PUB2",
        status: "processed",
        status_detail: "accredited",
        transactions: {
          payments: [
            {
              id: "PAY2",
              amount: "104.98",
              status: "processed",
              status_detail: "accredited",
              payment_method: { id: "master", type: "credit_card", installments: 3 },
            },
          ],
        },
      },
    }));
    const charge = await provider(m.fetch).createCard({
      publicId: "PUB2",
      amountCents: 10498,
      description: "Presente",
      payerEmail: "ana@exemplo.com",
      token: "card-token-123",
      paymentMethodId: "master",
      paymentType: "credit_card",
      installments: 3,
      identification: { type: "CPF", number: "12345678909" },
    });
    const body = JSON.parse(String(m.calls[0]!.init.body)) as SentBody;
    expect(body.transactions.payments[0]!.payment_method).toEqual({
      id: "master",
      type: "credit_card",
      token: "card-token-123",
      installments: 3,
    });
    expect(body.payer.identification).toEqual({ type: "CPF", number: "12345678909" });
    expect(charge).toMatchObject({
      status: "approved",
      method: "card",
      paymentId: "PAY2",
      amountCents: 10498,
      pix: null,
    });
  });

  it("cartão recusado vira 'rejected' com o status_detail", async () => {
    const m = mockFetch(() => ({
      status: 402,
      body: {
        id: "ORD03",
        external_reference: "PUB3",
        status: "failed",
        status_detail: "cc_rejected_insufficient_amount",
        transactions: { payments: [{ id: "P3", amount: "10.00" }] },
      },
    }));
    const charge = await provider(m.fetch).createCard({
      publicId: "PUB3",
      amountCents: 1000,
      description: "x",
      payerEmail: "a@exemplo.com",
      token: "t",
      paymentMethodId: "visa",
      paymentType: "credit_card",
      installments: 1,
    });
    expect(charge).toMatchObject({
      status: "rejected",
      statusDetail: "cc_rejected_insufficient_amount",
    });
  });

  it("erro de verdade do Mercado Pago vira PaymentProviderError", async () => {
    const m = mockFetch(() => ({ status: 401, body: { message: "invalid token" } }));
    await expect(provider(m.fetch).getCharge("ORD9")).rejects.toMatchObject({
      name: "PaymentProviderError",
      status: 401,
    });
  });

  it("reembolso total é POST /v1/orders/{id}/refund", async () => {
    const m = mockFetch(() => ({ body: pixOrder("ORD04", "PUB4", "refunded", "refunded") }));
    const charge = await provider(m.fetch).refund("ORD04");
    expect(m.calls[0]!.url).toBe("https://api.mercadopago.com/v1/orders/ORD04/refund");
    expect(m.calls[0]!.init.method).toBe("POST");
    expect(charge.status).toBe("refunded");
  });

  it("traduz os status da order", () => {
    expect(mapOrderStatus("processed", "accredited")).toBe("approved");
    expect(mapOrderStatus("action_required", "waiting_transfer")).toBe("pending");
    expect(mapOrderStatus("processing", "in_process")).toBe("pending");
    expect(mapOrderStatus("failed", "failed")).toBe("rejected");
    expect(mapOrderStatus("failed", "expired")).toBe("expired");
    expect(mapOrderStatus("canceled", "expired")).toBe("expired");
    expect(mapOrderStatus("canceled", "canceled")).toBe("cancelled");
    expect(mapOrderStatus("refunded", "refunded")).toBe("refunded");
    expect(mapOrderStatus("charged_back", "reimbursed")).toBe("refunded");
  });
});

describe("Mercado Pago: assinatura do webhook", () => {
  it("aceita a assinatura certa e recusa as erradas", () => {
    expect(verifySignature(SECRET, signedRequest("ORD01"))).toBe(true);
    expect(verifySignature(SECRET, signedRequest("ORD01", "outro-segredo"))).toBe(false);
    // data.id alfanumérico assinado em minúsculas (regra antiga da documentação).
    expect(verifySignature(SECRET, { ...signedRequest("ord01"), query: () => "ORD01" })).toBe(true);
    const noHeader = signedRequest("ORD01");
    expect(verifySignature(SECRET, { ...noHeader, header: () => undefined })).toBe(false);
    expect(verifySignature("", signedRequest("ORD01"))).toBe(false);
  });
});

describe("escolha do provedor pelo .env", () => {
  const base = {
    DATABASE_URL: "mysql://root:@127.0.0.1:3306/casamento",
    API_URL: "http://localhost:3333",
    WEB_KEY: "x".repeat(32),
    BETTER_AUTH_SECRET: "y".repeat(32),
    BETTER_AUTH_URL: "http://localhost:3333",
  };

  it("sem credenciais usa o simulado", () => {
    expect(createPaymentProvider(parseEnv(base)).name).toBe("simulado");
  });

  it("com MP_ACCESS_TOKEN usa o Mercado Pago e exige a chave pública e o segredo", () => {
    expect(() => parseEnv({ ...base, MP_ACCESS_TOKEN: "APP_USR-1" })).toThrow(
      /MP_PUBLIC_KEY: é obrigatória com PAYMENT_PROVIDER=mercadopago/,
    );
    const env = parseEnv({
      ...base,
      MP_ACCESS_TOKEN: "APP_USR-1",
      MP_PUBLIC_KEY: "APP_USR-pub",
      MP_WEBHOOK_SECRET: "s",
    });
    const p = createPaymentProvider(env);
    expect(p.name).toBe("mercadopago");
    expect(p.publicKey).toBe("APP_USR-pub");
  });

  it("PAYMENT_PROVIDER=simulado vence as credenciais", () => {
    const env = parseEnv({ ...base, PAYMENT_PROVIDER: "simulado", MP_ACCESS_TOKEN: "APP_USR-1" });
    expect(createPaymentProvider(env).name).toBe("simulado");
  });
});

describe("Mercado Pago de ponta a ponta na API (fetch mockado)", () => {
  // Estado do "Mercado Pago": a order nasce aguardando o Pix e é paga depois.
  const remote = new Map<string, ReturnType<typeof pixOrder>>();
  let seq = 0;
  const m = mockFetch(({ url, init }) => {
    if (init.method === "POST" && url.endsWith("/v1/orders")) {
      const body = JSON.parse(String(init.body)) as { external_reference: string };
      const id = `ORDTEST${Date.now()}${++seq}`;
      const order = pixOrder(id, body.external_reference);
      remote.set(id, order);
      return { status: 201, body: order };
    }
    const id = decodeURIComponent(url.split("/v1/orders/")[1] ?? "");
    const order = remote.get(id);
    return order ? { body: order } : { status: 404, body: { message: "not found" } };
  });
  const mp = provider(m.fetch);
  const { app, db } = testApp({ provider: mp });
  let giftId = 0;

  afterAll(async () => {
    if (giftId) {
      const orders = await db.select().from(giftOrders).where(eq(giftOrders.giftId, giftId));
      const ids = orders.map((o) => o.id);
      if (ids.length) {
        await db.delete(payments).where(inArray(payments.orderId, ids));
        await db.delete(giftOrders).where(inArray(giftOrders.id, ids));
      }
      for (const id of remote.keys()) {
        await db
          .delete(webhookEvents)
          .where(eq(webhookEvents.eventId, `order:${id}:order.processed:`));
      }
      await db.delete(gifts).where(eq(gifts.id, giftId));
    }
    await db.$client.end();
  });

  it("Pix → webhook assinado → pedido pago; assinatura inválida → 401", async () => {
    const slug = `teste-mp-${Date.now().toString(36)}`;
    const [res] = await db.insert(gifts).values({
      slug,
      title: "Presente MP",
      priceCents: 10000,
      quotaTotal: 1,
      category: "casa",
      tileDesign: "flor",
      sort: 9999,
    });
    giftId = res.insertId;

    const created = await app.request("/api/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-web-key": TEST_WEB_KEY,
        "x-client-ip": "10.77.0.1",
      },
      body: JSON.stringify({ giftSlug: slug, buyerName: "Ana", buyerEmail: "ana@exemplo.com" }),
    });
    expect(created.status).toBe(201);
    const order = OrderView.parse(await created.json());
    expect(order.provider).toBe("mercadopago");
    expect(order.card.publicKey).toBe("TEST-public");
    expect(order.pix?.qrImageBase64).toBe("iVBORw0KGgoAAAANSUhEUg==");

    const [row] = await db.select().from(giftOrders).where(eq(giftOrders.publicId, order.publicId));
    const mpId = row!.providerOrderId!;
    remote.set(mpId, pixOrder(mpId, order.publicId, "processed", "accredited"));

    const hook = (secret: string) => {
      const req = signedRequest(mpId, secret);
      return app.request(`/api/webhooks/payments?data.id=${mpId}&type=order`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signature": req.header("x-signature")!,
          "x-request-id": req.header("x-request-id")!,
        },
        body: JSON.stringify({ type: "order", action: "order.processed", data: { id: mpId } }),
      });
    };

    expect((await hook("segredo-falso")).status).toBe(401);
    expect((await hook(SECRET)).status).toBe(200);
    const paid = OrderView.parse(await (await app.request(`/api/orders/${order.publicId}`)).json());
    expect(paid.status).toBe("paid");
  });
});
