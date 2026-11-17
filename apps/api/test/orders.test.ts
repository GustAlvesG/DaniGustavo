import {
  eq,
  giftOrders,
  gifts,
  inArray,
  messages,
  payments,
  webhookEvents,
  type Database,
} from "@casamento/db";
import { ApiError, GiftsResponse, OrderView, PayWithCardResponse } from "@casamento/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { MailMessage, Mailer } from "../src/mailer.ts";
import type { Notifier } from "../src/orders/notify.ts";
import { expirePendingOrders } from "../src/orders/service.ts";
import { createSimulatedProvider } from "../src/payments/index.ts";
import { TEST_WEB_KEY, testApp } from "./helpers.ts";

// Usa o banco de DATABASE_URL já migrado e com seed. Cria presentes próprios (slugs únicos)
// e apaga tudo o que criou no fim; os presentes do seed só são lidos.

const sent: MailMessage[] = [];
const mailer: Mailer = {
  send(m) {
    sent.push(m);
    return Promise.resolve();
  },
};
const telegrams: string[] = [];
const notifier: Notifier = {
  telegram(text) {
    telegrams.push(text);
    return Promise.resolve();
  },
};

let clock = new Date();
const provider = createSimulatedProvider({ webhookSecret: `simulado:${TEST_WEB_KEY}` });
const { app, db, env } = testApp(
  { mailer, notifier, provider, now: () => clock },
  { ADMIN_EMAIL_1: "dani@exemplo.com", ADMIN_EMAIL_2: "gustavo@exemplo.com" },
);

const run = Date.now().toString(36);
const createdGifts: number[] = [];
let n = 0;
const ip = () => `10.9.${Math.floor(++n / 250)}.${(n % 250) + 1}`;
const write = (clientIp = ip()) => ({
  "Content-Type": "application/json",
  "X-Web-Key": TEST_WEB_KEY,
  "X-Client-Ip": clientIp,
});

async function makeGift(
  database: Database,
  opts: { quotaTotal: number; priceCents?: number; openAmount?: boolean },
) {
  const slug = `teste-${run}-${++n}`;
  const [res] = await database.insert(gifts).values({
    slug,
    title: `Presente de teste ${n}`,
    priceCents: opts.priceCents ?? 10000,
    openAmount: opts.openAmount ?? false,
    quotaTotal: opts.quotaTotal,
    category: "casa",
    tileDesign: "flor",
    sort: 9999,
  });
  createdGifts.push(res.insertId);
  return { slug, id: res.insertId };
}

const order = (body: Record<string, unknown>, headers = write()) =>
  app.request("/api/orders", { method: "POST", headers, body: JSON.stringify(body) });

const buyer = {
  buyerName: "Ana Teste",
  buyerEmail: "ana@exemplo.com",
  message: "Felicidades!",
  showOnWall: true,
};

async function getOrder(publicId: string) {
  const res = await app.request(`/api/orders/${publicId}`);
  expect(res.status).toBe(200);
  return OrderView.parse(await res.json());
}

async function quotaSold(id: number) {
  const [g] = await db.select().from(gifts).where(eq(gifts.id, id));
  return g!.quotaSold;
}

/** Ids dos eventos de webhook entregues pelos testes (apagados no fim). */
const hookEvents = new Set<string>();
const realApprove = provider.approve.bind(provider);
provider.approve = (id) => {
  const hook = realApprove(id);
  hookEvents.add((hook.body as { id: string }).id);
  return hook;
};

const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  clock = new Date();
  sent.length = 0;
  telegrams.length = 0;
});

afterAll(async () => {
  if (createdGifts.length) {
    const orders = await db
      .select({ id: giftOrders.id, providerOrderId: giftOrders.providerOrderId })
      .from(giftOrders)
      .where(inArray(giftOrders.giftId, createdGifts));
    const ids = orders.map((o) => o.id);
    if (ids.length) {
      await db.delete(payments).where(inArray(payments.orderId, ids));
      await db.delete(messages).where(inArray(messages.giftOrderId, ids));
      await db.delete(giftOrders).where(inArray(giftOrders.id, ids));
    }
    for (const eventId of hookEvents) {
      await db.delete(webhookEvents).where(eq(webhookEvents.eventId, eventId));
    }
    await db.delete(gifts).where(inArray(gifts.id, createdGifts));
  }
  await db.$client.end();
});

describe("GET /api/gifts", () => {
  it("lista os presentes ativos com cotas restantes, categorias e taxa do cartão", async () => {
    const res = await app.request("/api/gifts");
    expect(res.status).toBe(200);
    const body = GiftsResponse.parse(await res.json());
    expect(body.gifts.find((g) => g.slug === "jantar-em-lisboa")).toMatchObject({
      quotaTotal: 4,
      priceCents: 45000,
    });
    expect(body.gifts.find((g) => g.slug === "contribuicao-livre")?.openAmount).toBe(true);
    expect(body.categories.map((c) => c.slug)).toContain("lua-de-mel");
    expect(body.cardFeePercent).toBeGreaterThan(0);
  });
});

describe("POST /api/orders (Pix)", () => {
  it("cria o pedido, reserva as cotas e devolve o Pix copia e cola", async () => {
    const gift = await makeGift(db, { quotaTotal: 3, priceCents: 20000 });
    const res = await order({ ...buyer, giftSlug: gift.slug, quantity: 2 });
    expect(res.status).toBe(201);
    const body = OrderView.parse(await res.json());
    expect(body).toMatchObject({
      status: "pending",
      method: "pix",
      provider: "simulado",
      quantity: 2,
      amountCents: 40000,
      totalCents: 40000,
    });
    expect(body.pix?.code).toContain("SIMULACAO");
    expect(new Date(body.expiresAt).getTime() - clock.getTime()).toBe(30 * 60_000);
    expect(await quotaSold(gift.id)).toBe(2);

    const list = GiftsResponse.parse(await (await app.request("/api/gifts")).json());
    expect(list.gifts.find((g) => g.slug === gift.slug)?.quotaLeft).toBe(1);
  });

  it("exige X-Web-Key", async () => {
    const res = await order(
      { ...buyer, giftSlug: "cafeteira" },
      { "Content-Type": "application/json", "X-Web-Key": "", "X-Client-Ip": ip() },
    );
    expect(res.status).toBe(401);
  });

  it("valida o valor livre e recusa presente inexistente", async () => {
    const livre = await makeGift(db, { quotaTotal: 999, openAmount: true });
    const low = await order({ ...buyer, giftSlug: livre.slug, amountCents: 500 });
    expect(low.status).toBe(422);
    expect(ApiError.parse(await low.json()).error.message).toContain("R$ 10,00");

    const ok = await order({ ...buyer, giftSlug: livre.slug, amountCents: 12345, quantity: 5 });
    expect(ok.status).toBe(201);
    expect(OrderView.parse(await ok.json())).toMatchObject({ quantity: 1, amountCents: 12345 });

    const missing = await order({ ...buyer, giftSlug: "nao-existe" });
    expect(missing.status).toBe(404);
  });

  it("duas compras simultâneas da última cota: só uma passa", async () => {
    const gift = await makeGift(db, { quotaTotal: 1 });
    const [a, b] = await Promise.all([
      order({ ...buyer, giftSlug: gift.slug }),
      order({ ...buyer, buyerName: "Bruno Teste", giftSlug: gift.slug }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    const err = ApiError.parse(await loser.json());
    expect(err.error.code).toBe("gift_unavailable");
    expect(err.error.message).toContain("Escolha outro item");
    expect(await quotaSold(gift.id)).toBe(1);
  });

  it("limita a criação de pedidos por IP", async () => {
    const gift = await makeGift(db, { quotaTotal: 50 });
    const sameIp = write("10.250.0.1");
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await order({ ...buyer, giftSlug: gift.slug }, sameIp)).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe("pagamento aprovado (Pix simulado → webhook)", () => {
  it("marca como pago, grava o pagamento e o recado e avisa todo mundo", async () => {
    const gift = await makeGift(db, { quotaTotal: 2 });
    const created = OrderView.parse(await (await order({ ...buyer, giftSlug: gift.slug })).json());

    const res = await app.request(`/api/dev/orders/${created.publicId}/approve`, {
      method: "POST",
      headers: write(),
    });
    expect(res.status).toBe(200);

    const paid = await getOrder(created.publicId);
    expect(paid.status).toBe("paid");
    expect(paid.pix).toBeNull();
    expect(paid.paidAt).not.toBeNull();
    expect(await quotaSold(gift.id)).toBe(1); // a reserva virou venda, sem baixa dupla

    const [row] = await db
      .select()
      .from(giftOrders)
      .where(eq(giftOrders.publicId, created.publicId));
    const pays = await db.select().from(payments).where(eq(payments.orderId, row!.id));
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ method: "pix", grossCents: 10000, gateway: "simulado" });
    const msgs = await db.select().from(messages).where(eq(messages.giftOrderId, row!.id));
    expect(msgs[0]).toMatchObject({ author: "Ana Teste", body: "Felicidades!", approved: false });

    await flush();
    expect(sent.map((m) => m.to).sort()).toEqual([
      "ana@exemplo.com",
      "dani@exemplo.com",
      "gustavo@exemplo.com",
    ]);
    expect(sent.find((m) => m.to === "ana@exemplo.com")?.subject).toBe("Presente enviado");
    expect(sent.find((m) => m.to === "dani@exemplo.com")?.text).toContain("Felicidades!");
    expect(telegrams[0]).toContain("Ana Teste");
  });

  it("webhook repetido não paga nem avisa duas vezes", async () => {
    const gift = await makeGift(db, { quotaTotal: 1 });
    const created = OrderView.parse(await (await order({ ...buyer, giftSlug: gift.slug })).json());
    const [row] = await db
      .select()
      .from(giftOrders)
      .where(eq(giftOrders.publicId, created.publicId));
    const hook = provider.approve(row!.providerOrderId!);
    const deliver = () =>
      app.request(hook.path, {
        method: "POST",
        headers: hook.headers,
        body: JSON.stringify(hook.body),
      });
    expect((await deliver()).status).toBe(200);
    const again = await deliver();
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ duplicate: true });
    await flush();
    expect(sent.filter((m) => m.to === "ana@exemplo.com")).toHaveLength(1);
    expect(await quotaSold(gift.id)).toBe(1);
  });

  it("webhook com token inválido recebe 401 e não muda nada", async () => {
    const gift = await makeGift(db, { quotaTotal: 1 });
    const created = OrderView.parse(await (await order({ ...buyer, giftSlug: gift.slug })).json());
    const [row] = await db
      .select()
      .from(giftOrders)
      .where(eq(giftOrders.publicId, created.publicId));
    const id = row!.providerOrderId!;
    const body = JSON.stringify({ id: "evt_falso", event: "PAYMENT_RECEIVED", payment: { id } });
    const path = "/api/webhooks/payments";

    const forged = await app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "asaas-access-token": "token-errado" },
      body,
    });
    expect(forged.status).toBe(401);

    const unsigned = await app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(unsigned.status).toBe(401);
    expect((await getOrder(created.publicId)).status).toBe("pending");
  });
});

describe("cartão (simulado)", () => {
  const card = (last4: string, coverFee = false) => ({
    token: `sim_${last4}_abc`,
    paymentMethodId: "visa",
    paymentType: "credit_card",
    installments: 3,
    coverFee,
  });

  it("aprovado: paga o pedido com a taxa coberta", async () => {
    const gift = await makeGift(db, { quotaTotal: 1, priceCents: 10000 });
    const created = OrderView.parse(await (await order({ ...buyer, giftSlug: gift.slug })).json());
    const res = await app.request(`/api/orders/${created.publicId}/card`, {
      method: "POST",
      headers: write(),
      body: JSON.stringify(card("1111", true)),
    });
    expect(res.status).toBe(200);
    const body = PayWithCardResponse.parse(await res.json());
    expect(body.outcome).toBe("approved");
    expect(body.order).toMatchObject({ status: "paid", method: "card", feeCents: 498 });
    expect(body.order.totalCents).toBe(10498);
  });

  it("recusado: o pedido continua pendente e a mensagem diz o que fazer", async () => {
    const gift = await makeGift(db, { quotaTotal: 1 });
    const created = OrderView.parse(await (await order({ ...buyer, giftSlug: gift.slug })).json());
    const res = await app.request(`/api/orders/${created.publicId}/card`, {
      method: "POST",
      headers: write(),
      body: JSON.stringify(card("0002", true)),
    });
    const body = PayWithCardResponse.parse(await res.json());
    expect(body.outcome).toBe("rejected");
    expect(body.message).toContain("pague com Pix");
    expect(body.order).toMatchObject({ status: "pending", feeCents: 0 });
    expect(body.order.pix).not.toBeNull();
    expect(await quotaSold(gift.id)).toBe(1);
  });

  it("POST /api/orders com method card cobra na hora", async () => {
    const gift = await makeGift(db, { quotaTotal: 1 });
    const res = await order({ ...buyer, giftSlug: gift.slug, method: "card", card: card("1111") });
    expect(res.status).toBe(201);
    expect(OrderView.parse(await res.json()).status).toBe("paid");
  });
});

describe("expiração", () => {
  it("o job expira pendentes vencidos e devolve as cotas", async () => {
    const gift = await makeGift(db, { quotaTotal: 2 });
    const created = OrderView.parse(
      await (await order({ ...buyer, giftSlug: gift.slug, quantity: 2 })).json(),
    );
    expect(await quotaSold(gift.id)).toBe(2);

    const deps = { env, db, provider, mailer, notifier, now: () => clock };
    clock = new Date(clock.getTime() + 29 * 60_000);
    await expirePendingOrders(deps);
    expect((await getOrder(created.publicId)).status).toBe("pending");

    clock = new Date(clock.getTime() + 2 * 60_000);
    expect(await expirePendingOrders(deps)).toBeGreaterThanOrEqual(1);
    const expired = await getOrder(created.publicId);
    expect(expired.status).toBe("expired");
    expect(expired.pix).toBeNull();
    expect(await quotaSold(gift.id)).toBe(0);

    // Pedido expirado não aceita mais cartão.
    const late = await app.request(`/api/orders/${created.publicId}/card`, {
      method: "POST",
      headers: write(),
      body: JSON.stringify({ token: "sim_1111_x", paymentMethodId: "visa" }),
    });
    expect(late.status).toBe(409);
  });

  it("GET do pedido vencido já mostra expirado, mesmo antes do job", async () => {
    const gift = await makeGift(db, { quotaTotal: 1 });
    const created = OrderView.parse(await (await order({ ...buyer, giftSlug: gift.slug })).json());
    clock = new Date(clock.getTime() + 31 * 60_000);
    expect((await getOrder(created.publicId)).status).toBe("expired");
    expect(await quotaSold(gift.id)).toBe(0);
  });

  it("não expira um Pix que o provedor já aprovou", async () => {
    const gift = await makeGift(db, { quotaTotal: 1 });
    const created = OrderView.parse(await (await order({ ...buyer, giftSlug: gift.slug })).json());
    const [row] = await db
      .select()
      .from(giftOrders)
      .where(eq(giftOrders.publicId, created.publicId));
    provider.approve(row!.providerOrderId!); // pago, mas o webhook se perdeu
    clock = new Date(clock.getTime() + 31 * 60_000);
    await expirePendingOrders({ env, db, provider, mailer, notifier, now: () => clock });
    expect((await getOrder(created.publicId)).status).toBe("paid");
    expect(await quotaSold(gift.id)).toBe(1);
  });
});
