import { eq, giftOrders, gifts, inArray, payments, webhookEvents } from "@casamento/db";
import { GiftsResponse, OrderView, isValidCpf } from "@casamento/shared";
import { afterAll, describe, expect, it } from "vitest";
import { parseEnv } from "../src/env.ts";
import { expirePendingOrders } from "../src/orders/service.ts";
import {
  createAsaasProvider,
  createPaymentProvider,
  mapAsaasStatus,
  type AsaasPayment,
  type WebhookRequest,
} from "../src/payments/index.ts";
import { TEST_WEB_KEY, testApp } from "./helpers.ts";

// Respostas gravadas no formato da documentação do Asaas (API v3, docs.asaas.com).

const KEY = "$aact_hmlg_000000000000000000000000000000000000000000000000000000000000chave-teste";
const TOKEN = "token-do-webhook-de-teste-com-32-caracteres-ou-mais";
const CPF = "52998224725"; // CPF válido de exemplo (dígitos verificadores certos)
const QR_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function mockFetch(responder: (call: Call) => { status?: number; body?: unknown }) {
  const calls: Call[] = [];
  const fn = (input: string | URL | Request, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      method: init.method ?? "GET",
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const { status = 200, body } = responder(call);
    return Promise.resolve(
      new Response(body === undefined ? "" : JSON.stringify(body), { status }),
    );
  };
  return { fetch: fn as typeof fetch, calls };
}

const payment = (over: Partial<AsaasPayment> & { id: string }): AsaasPayment => ({
  object: "payment",
  customer: "cus_000005219613",
  status: "PENDING",
  billingType: "PIX",
  value: 100,
  externalReference: "PUB1",
  invoiceUrl: `https://sandbox.asaas.com/i/${over.id.replace("pay_", "")}`,
  deleted: false,
  ...over,
});

const provider = (f: typeof fetch) =>
  createAsaasProvider({
    apiKey: KEY,
    environment: "sandbox",
    webhookToken: TOKEN,
    fetch: f,
    now: () => new Date("2026-11-17T15:00:00Z"),
  });

const hookReq = (headers: Record<string, string>, body: unknown): WebhookRequest => ({
  header: (n) => headers[n.toLowerCase()],
  query: () => undefined,
  body,
});

describe("Asaas: cobranças", () => {
  it("Pix: reaproveita o cliente pelo CPF, cria a cobrança e lê o QR", async () => {
    const m = mockFetch(({ url, method }) => {
      if (url.includes("/customers?")) return { body: { data: [{ id: "cus_1" }] } };
      if (method === "POST" && url.endsWith("/payments")) return { body: payment({ id: "pay_1" }) };
      if (url.endsWith("/payments/pay_1/pixQrCode")) {
        return {
          body: {
            encodedImage: QR_PNG,
            payload: "00020101021226820014br.gov.bcb.pix2560pix.asaas.com/qr/teste",
            expirationDate: "2027-11-18 23:59:59",
          },
        };
      }
      return { status: 404, body: { errors: [{ code: "not_found" }] } };
    });
    const charge = await provider(m.fetch).createPix({
      publicId: "PUB1",
      amountCents: 10000,
      description: "Presente: Cafeteira",
      payerEmail: "ana@exemplo.com",
      payerName: "Ana Teste",
      payerCpf: CPF,
      expiresInMinutes: 30,
    });

    expect(m.calls.map((c) => `${c.method} ${c.url.split("?")[0]}`)).toEqual([
      "GET https://api-sandbox.asaas.com/v3/customers",
      "POST https://api-sandbox.asaas.com/v3/payments",
      "GET https://api-sandbox.asaas.com/v3/payments/pay_1/pixQrCode",
    ]);
    expect(m.calls[0]!.headers.access_token).toBe(KEY);
    expect(m.calls[0]!.headers["user-agent"]).toMatch(/sandbox/);
    expect(m.calls[1]!.body).toEqual({
      customer: "cus_1",
      billingType: "PIX",
      value: 100,
      dueDate: "2026-11-18",
      description: "Presente: Cafeteira",
      externalReference: "PUB1",
    });
    expect(charge).toMatchObject({
      providerOrderId: "pay_1",
      externalReference: "PUB1",
      status: "pending",
      method: "pix",
      amountCents: 10000,
      pix: { code: expect.stringContaining("br.gov.bcb.pix") as string, qrImageBase64: QR_PNG },
    });
  });

  it("Pix: cria o cliente quando o CPF é novo, sem notificações do Asaas", async () => {
    const m = mockFetch(({ url, method }) => {
      if (url.includes("/customers?")) return { body: { data: [] } };
      if (method === "POST" && url.endsWith("/customers")) return { body: { id: "cus_novo" } };
      if (method === "POST") return { body: payment({ id: "pay_2" }) };
      return { body: { encodedImage: QR_PNG, payload: "000201" } };
    });
    await provider(m.fetch).createPix({
      publicId: "PUB2",
      amountCents: 5000,
      description: "x",
      payerEmail: "ana@exemplo.com",
      payerName: "Ana Teste",
      payerCpf: CPF,
      expiresInMinutes: 30,
    });
    expect(m.calls[1]!.body).toEqual({
      name: "Ana Teste",
      cpfCnpj: CPF,
      email: "ana@exemplo.com",
      notificationDisabled: true,
    });
    expect((m.calls[2]!.body as { customer: string }).customer).toBe("cus_novo");
  });

  it("Pix sem CPF falha antes de chamar o Asaas", async () => {
    const m = mockFetch(() => ({ body: {} }));
    await expect(
      provider(m.fetch).createPix({
        publicId: "P",
        amountCents: 100,
        description: "x",
        payerEmail: "a@exemplo.com",
        payerName: "A",
        expiresInMinutes: 30,
      }),
    ).rejects.toMatchObject({ name: "PaymentProviderError", status: 422 });
    expect(m.calls).toHaveLength(0);
  });

  it("sem QR (ex.: conta sem chave Pix) apaga a cobrança e avisa", async () => {
    const m = mockFetch(({ url, method }) => {
      if (url.includes("/customers?")) return { body: { data: [{ id: "cus_1" }] } };
      if (method === "POST") return { body: payment({ id: "pay_3" }) };
      if (method === "DELETE") return { body: { deleted: true, id: "pay_3" } };
      return { status: 400, body: { errors: [{ code: "invalid_action", description: "x" }] } };
    });
    await expect(
      provider(m.fetch).createPix({
        publicId: "P3",
        amountCents: 100,
        description: "x",
        payerEmail: "a@exemplo.com",
        payerName: "A",
        payerCpf: CPF,
        expiresInMinutes: 30,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(m.calls.at(-1)).toMatchObject({ method: "DELETE" });
  });

  it("erro do Asaas não leva o CPF na mensagem (a busca de cliente vai na URL)", async () => {
    const m = mockFetch(() => ({
      status: 401,
      body: { errors: [{ code: "invalid_access_token", description: "chave inválida" }] },
    }));
    const err = (await provider(m.fetch)
      .createPix({
        publicId: "P",
        amountCents: 100,
        description: "x",
        payerEmail: "a@exemplo.com",
        payerName: "A",
        payerCpf: CPF,
        expiresInMinutes: 30,
      })
      .catch((e: unknown) => e)) as Error & { details: unknown };
    expect(err.message).not.toContain(CPF);
    expect(JSON.stringify(err.details)).not.toContain(CPF);
    expect(err.details).toEqual([{ code: "invalid_access_token", description: "chave inválida" }]);
  });

  it("cartão: cobrança CREDIT_CARD com o cliente do Pix e link da fatura", async () => {
    const m = mockFetch(({ url, method }) => {
      if (url.includes("/payments?externalReference=")) {
        return { body: { object: "list", hasMore: false, data: [payment({ id: "pay_pix" })] } };
      }
      if (method === "POST") {
        return {
          body: payment({ id: "pay_card", billingType: "CREDIT_CARD", value: 104.98 }),
        };
      }
      return { status: 404 };
    });
    const charge = await provider(m.fetch).createCardCheckout!({
      publicId: "PUB1",
      amountCents: 10498,
      description: "Presente: Cafeteira",
      baseChargeId: "pay_pix",
      successUrl: "https://danigustavo.com.br/presentes/obrigado/PUB1",
    });
    expect(m.calls[1]!.body).toEqual({
      customer: "cus_000005219613",
      billingType: "CREDIT_CARD",
      value: 104.98,
      dueDate: "2026-11-18",
      description: "Presente: Cafeteira",
      externalReference: "PUB1",
      callback: {
        successUrl: "https://danigustavo.com.br/presentes/obrigado/PUB1",
        autoRedirect: true,
      },
    });
    expect(charge).toMatchObject({
      providerOrderId: "pay_card",
      method: "card",
      checkoutUrl: "https://sandbox.asaas.com/i/card",
    });
  });

  it("cartão: successUrl recusada (domínio não cadastrado) cria sem redirecionamento", async () => {
    let posts = 0;
    const m = mockFetch(({ url, method }) => {
      if (url.includes("/payments?")) return { body: { data: [] } };
      if (url.endsWith("/payments/pay_pix")) return { body: payment({ id: "pay_pix" }) };
      if (method === "POST" && ++posts === 1) {
        return { status: 400, body: { errors: [{ code: "invalid_callback" }] } };
      }
      return { body: payment({ id: "pay_c2", billingType: "CREDIT_CARD" }) };
    });
    const charge = await provider(m.fetch).createCardCheckout!({
      publicId: "PUB1",
      amountCents: 10000,
      description: "x",
      baseChargeId: "pay_pix",
      successUrl: "https://outro-dominio.com/obrigado",
    });
    expect(posts).toBe(2);
    expect(m.calls.at(-1)!.body).not.toHaveProperty("callback");
    expect(charge.checkoutUrl).toBe("https://sandbox.asaas.com/i/c2");
  });

  it("cartão: reaproveita a fatura aberta do mesmo valor e apaga a de outro valor", async () => {
    const m = mockFetch(({ url, method }) => {
      if (url.includes("/payments?")) {
        return {
          body: {
            data: [
              payment({ id: "pay_pix" }),
              payment({ id: "pay_old", billingType: "CREDIT_CARD", value: 104.98 }),
              payment({ id: "pay_same", billingType: "CREDIT_CARD", value: 100 }),
            ],
          },
        };
      }
      if (method === "DELETE") return { body: { deleted: true } };
      return { status: 500 };
    });
    const charge = await provider(m.fetch).createCardCheckout!({
      publicId: "PUB1",
      amountCents: 10000,
      description: "x",
      baseChargeId: "pay_pix",
      successUrl: null,
    });
    expect(charge.providerOrderId).toBe("pay_same");
    expect(m.calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(m.calls.find((c) => c.method === "DELETE")?.url).toMatch(/pay_old$/);
  });

  it("estorno é POST /payments/{id}/refund e cancelar é DELETE", async () => {
    const m = mockFetch(({ method }) =>
      method === "DELETE"
        ? { body: { deleted: true, id: "pay_9" } }
        : { body: payment({ id: "pay_9", status: "REFUNDED" }) },
    );
    const p = provider(m.fetch);
    expect((await p.refund("pay_9")).status).toBe("refunded");
    expect(m.calls[0]).toMatchObject({
      method: "POST",
      url: "https://api-sandbox.asaas.com/v3/payments/pay_9/refund",
      body: {},
    });
    await p.cancel("pay_9");
    expect(m.calls[1]).toMatchObject({
      method: "DELETE",
      url: "https://api-sandbox.asaas.com/v3/payments/pay_9",
    });
  });

  it("cobrança inexistente vira PaymentProviderError 404", async () => {
    const m = mockFetch(() => ({ status: 404, body: { errors: [] } }));
    await expect(provider(m.fetch).getCharge("pay_x")).rejects.toMatchObject({ status: 404 });
  });

  it("traduz os status da cobrança", () => {
    expect(mapAsaasStatus({ status: "PENDING" })).toBe("pending");
    expect(mapAsaasStatus({ status: "AWAITING_RISK_ANALYSIS" })).toBe("pending");
    expect(mapAsaasStatus({ status: "CONFIRMED" })).toBe("approved");
    expect(mapAsaasStatus({ status: "RECEIVED" })).toBe("approved");
    expect(mapAsaasStatus({ status: "REFUNDED" })).toBe("refunded");
    expect(mapAsaasStatus({ status: "REFUND_IN_PROGRESS" })).toBe("refunded");
    expect(mapAsaasStatus({ status: "OVERDUE" })).toBe("expired");
    expect(mapAsaasStatus({ status: "PENDING", deleted: true })).toBe("cancelled");
    expect(mapAsaasStatus({ status: "CHARGEBACK_REQUESTED" })).toBe("approved");
  });
});

describe("Asaas: webhook", () => {
  const p = provider(mockFetch(() => ({ body: {} })).fetch);
  const body = { id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } };

  it("confere o token do header asaas-access-token", () => {
    expect(p.verifyWebhook(hookReq({ "asaas-access-token": TOKEN }, body))).toBe(true);
    expect(p.verifyWebhook(hookReq({ "asaas-access-token": `${TOKEN}x` }, body))).toBe(false);
    expect(p.verifyWebhook(hookReq({}, body))).toBe(false);
    const empty = createAsaasProvider({ apiKey: KEY, environment: "sandbox", webhookToken: "" });
    expect(empty.verifyWebhook(hookReq({ "asaas-access-token": "" }, body))).toBe(false);
  });

  it("lê o id do evento e da cobrança; ignora eventos que não mudam o pedido", () => {
    expect(p.parseWebhook(hookReq({}, body))).toEqual({
      eventId: "evt_1",
      providerOrderId: "pay_1",
      type: "PAYMENT_RECEIVED",
    });
    expect(p.parseWebhook(hookReq({}, { ...body, event: "PAYMENT_CREATED" }))).toBeNull();
    expect(p.parseWebhook(hookReq({}, { ...body, event: "CHECKOUT_PAID" }))).toBeNull();
    expect(p.parseWebhook(hookReq({}, { event: "PAYMENT_RECEIVED" }))).toBeNull();
  });
});

describe("Asaas: configuração no .env", () => {
  const base = {
    DATABASE_URL: "mysql://root:@127.0.0.1:3306/casamento",
    API_URL: "http://localhost:3333",
    WEB_KEY: "x".repeat(32),
    BETTER_AUTH_SECRET: "y".repeat(32),
    BETTER_AUTH_URL: "http://localhost:3333",
  };

  it("sem PAYMENT_PROVIDER usa o simulado, mesmo com a chave no .env", () => {
    expect(createPaymentProvider(parseEnv(base)).name).toBe("simulado");
    expect(createPaymentProvider(parseEnv({ ...base, ASAAS_API_KEY: KEY })).name).toBe("simulado");
  });

  it("PAYMENT_PROVIDER=asaas exige a chave; o token do webhook só é obrigatório em produção", () => {
    expect(() => parseEnv({ ...base, PAYMENT_PROVIDER: "asaas" })).toThrow(/ASAAS_API_KEY/);
    const asaas = { ...base, PAYMENT_PROVIDER: "asaas", ASAAS_API_KEY: KEY };
    expect(parseEnv(asaas).ASAAS_WEBHOOK_TOKEN).toBeUndefined();
    expect(() => parseEnv({ ...asaas, NODE_ENV: "production" })).toThrow(
      /ASAAS_WEBHOOK_TOKEN: é obrigatória em produção/,
    );
    expect(() => parseEnv({ ...asaas, ASAAS_WEBHOOK_TOKEN: "curto" })).toThrow(
      /ASAAS_WEBHOOK_TOKEN: fora do padrão/,
    );
    const env = parseEnv({
      ...base,
      PAYMENT_PROVIDER: "asaas",
      ASAAS_API_KEY: KEY,
      ASAAS_WEBHOOK_TOKEN: TOKEN,
    });
    expect(env.ASAAS_ENV).toBe("sandbox");
    const p = createPaymentProvider(env);
    expect(p.name).toBe("asaas");
    expect(p.requiresCpf).toBe(true);
  });

  it("deduz o ambiente pelo prefixo e falha se ASAAS_ENV divergir (sem mostrar a chave)", () => {
    const prod = KEY.replace("$aact_hmlg_", "$aact_prod_");
    expect(parseEnv({ ...base, ASAAS_API_KEY: prod }).ASAAS_ENV).toBe("producao");
    let message = "";
    try {
      parseEnv({ ...base, ASAAS_API_KEY: prod, ASAAS_ENV: "sandbox" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/ASAAS_ENV: diz sandbox, mas a ASAAS_API_KEY é de producao/);
    expect(message).not.toContain(prod);
    expect(() => parseEnv({ ...base, ASAAS_API_KEY: "chave-sem-prefixo" })).toThrow(/ASAAS_ENV/);
    expect(parseEnv({ ...base, ASAAS_API_KEY: "outra", ASAAS_ENV: "producao" }).ASAAS_ENV).toBe(
      "producao",
    );
    expect(() => parseEnv({ ...base, PAYMENT_PROVIDER: "mercadopago" })).toThrow(
      /use simulado ou asaas/,
    );
  });

  it("valida o CPF pelos dígitos verificadores", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });
});

describe("Asaas de ponta a ponta na API (fetch mockado)", () => {
  // Estado do "Asaas": cobranças por id; o teste muda o status como o banco faria.
  const remote = new Map<string, AsaasPayment>();
  let seq = 0;
  const m = mockFetch(({ url, method, body }) => {
    const path = url.replace("https://api-sandbox.asaas.com/v3", "");
    if (path.startsWith("/customers?")) return { body: { data: [{ id: "cus_e2e" }] } };
    if (method === "POST" && path === "/payments") {
      const b = body as { externalReference: string; billingType: string; value: number };
      const id = `pay_e2e${Date.now()}${++seq}`;
      const p = payment({
        id,
        externalReference: b.externalReference,
        billingType: b.billingType,
        value: b.value,
      });
      remote.set(id, p);
      return { body: p };
    }
    if (path.startsWith("/payments?externalReference=")) {
      const ref = decodeURIComponent(path.split("=")[1]!.split("&")[0]!);
      return {
        body: {
          data: [...remote.values()].filter((p) => p.externalReference === ref && !p.deleted),
        },
      };
    }
    const qr = /^\/payments\/([^/]+)\/pixQrCode$/.exec(path);
    if (qr) return { body: { encodedImage: QR_PNG, payload: `000201-${qr[1]}` } };
    const one = /^\/payments\/([^/?]+)$/.exec(path);
    const found = one ? remote.get(one[1]!) : undefined;
    if (found && method === "DELETE") {
      found.deleted = true;
      return { body: { deleted: true, id: found.id } };
    }
    if (found) return { body: found };
    return { status: 404, body: { errors: [{ code: "not_found" }] } };
  });
  let clock = new Date();
  const asaas = createAsaasProvider({
    apiKey: KEY,
    environment: "sandbox",
    webhookToken: TOKEN,
    fetch: m.fetch,
  });
  const { app, db, env } = testApp({ provider: asaas, now: () => clock });
  const giftIds: number[] = [];
  const events: string[] = [];

  afterAll(async () => {
    if (giftIds.length) {
      const orders = await db.select().from(giftOrders).where(inArray(giftOrders.giftId, giftIds));
      const ids = orders.map((o) => o.id);
      if (ids.length) {
        await db.delete(payments).where(inArray(payments.orderId, ids));
        await db.delete(giftOrders).where(inArray(giftOrders.id, ids));
      }
      if (events.length)
        await db.delete(webhookEvents).where(inArray(webhookEvents.eventId, events));
      await db.delete(gifts).where(inArray(gifts.id, giftIds));
    }
    await db.$client.end();
  });

  const write = (ip: string) => ({
    "content-type": "application/json",
    "x-web-key": TEST_WEB_KEY,
    "x-client-ip": ip,
  });

  async function newOrder(ip: string, extra: Record<string, unknown> = { buyerCpf: CPF }) {
    const slug = `teste-asaas-${Date.now().toString(36)}-${++seq}`;
    const [res] = await db.insert(gifts).values({
      slug,
      title: "Presente Asaas",
      priceCents: 10000,
      quotaTotal: 1,
      category: "casa",
      tileDesign: "flor",
      sort: 9999,
    });
    giftIds.push(res.insertId);
    const created = await app.request("/api/orders", {
      method: "POST",
      headers: write(ip),
      body: JSON.stringify({
        giftSlug: slug,
        buyerName: "Ana",
        buyerEmail: "ana@exemplo.com",
        ...extra,
      }),
    });
    return { created, giftId: res.insertId };
  }

  const getOrder = async (publicId: string) =>
    OrderView.parse(await (await app.request(`/api/orders/${publicId}`)).json());

  const hook = (eventId: string, paymentId: string, token = TOKEN) => {
    events.push(eventId);
    return app.request("/api/webhooks/payments", {
      method: "POST",
      headers: { "content-type": "application/json", "asaas-access-token": token },
      body: JSON.stringify({ id: eventId, event: "PAYMENT_RECEIVED", payment: { id: paymentId } }),
    });
  };

  it("a lista avisa que o CPF é obrigatório e o pedido sem CPF é recusado", async () => {
    const list = GiftsResponse.parse(await (await app.request("/api/gifts")).json());
    expect(list.requiresCpf).toBe(true);
    const { created } = await newOrder("10.78.0.1", {});
    expect(created.status).toBe(422);
    const bad = await newOrder("10.78.0.2", { buyerCpf: "123.456.789-00" });
    expect(bad.created.status).toBe(422);
    expect(await bad.created.text()).toContain("CPF inválido");
  });

  it("Pix → webhook com token → pago; token errado → 401; evento repetido não processa de novo", async () => {
    const { created } = await newOrder("10.78.0.3");
    expect(created.status).toBe(201);
    const order = OrderView.parse(await created.json());
    expect(order).toMatchObject({ provider: "asaas", card: { checkout: "hosted" } });
    expect(order.pix?.qrImageBase64).toBe(QR_PNG);

    const [row] = await db.select().from(giftOrders).where(eq(giftOrders.publicId, order.publicId));
    expect(JSON.stringify(row)).not.toContain(CPF); // o CPF não fica no banco
    const payId = row!.providerOrderId!;

    const eventId = `evt_teste_${Date.now()}`;
    expect((await hook(eventId, payId, "token-errado")).status).toBe(401);
    expect((await getOrder(order.publicId)).status).toBe("pending");
    remote.get(payId)!.status = "RECEIVED";

    const gets = () => m.calls.filter((c) => c.method === "GET" && c.url.endsWith(payId)).length;
    expect((await hook(eventId, payId)).status).toBe(200);
    expect((await getOrder(order.publicId)).status).toBe("paid");
    const before = gets();
    const again = await hook(eventId, payId);
    expect(await again.json()).toMatchObject({ duplicate: true });
    expect(gets()).toBe(before); // o repetido nem consulta o Asaas
    const pays = await db.select().from(payments).where(eq(payments.orderId, row!.id));
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ gateway: "asaas", gatewayId: payId, method: "pix" });
  });

  it("cartão na fatura: link, taxa, pago sem webhook (consulta ao abrir) e Pix apagado", async () => {
    const { created } = await newOrder("10.78.0.4");
    const order = OrderView.parse(await created.json());
    const res = await app.request(`/api/orders/${order.publicId}/card-checkout`, {
      method: "POST",
      headers: write("10.78.0.4"),
      body: JSON.stringify({ coverFee: true }),
    });
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url).toMatch(/^https:\/\/sandbox\.asaas\.com\/i\//);
    const card = [...remote.values()].find(
      (p) => p.externalReference === order.publicId && p.billingType === "CREDIT_CARD",
    )!;
    expect(card.value).toBe(104.98);

    card.status = "CONFIRMED"; // pagou na fatura; o webhook ainda não chegou
    clock = new Date(clock.getTime() + 20_000);
    const paid = await getOrder(order.publicId);
    expect(paid).toMatchObject({ status: "paid", method: "card", feeCents: 498 });
    const pix = [...remote.values()].find(
      (p) => p.externalReference === order.publicId && p.billingType === "PIX",
    )!;
    expect(pix.deleted).toBe(true);
  });

  it("expiração confere o Asaas e apaga as cobranças abertas", async () => {
    const { created, giftId } = await newOrder("10.78.0.5");
    const order = OrderView.parse(await created.json());
    clock = new Date(clock.getTime() + 31 * 60_000);
    await expirePendingOrders({
      env,
      db,
      provider: asaas,
      mailer: { send: () => Promise.resolve() },
      now: () => clock,
    });
    expect((await getOrder(order.publicId)).status).toBe("expired");
    const pix = [...remote.values()].find((p) => p.externalReference === order.publicId)!;
    expect(pix.deleted).toBe(true);
    const [g] = await db.select().from(gifts).where(eq(gifts.id, giftId));
    expect(g!.quotaSold).toBe(0);
  });
});
