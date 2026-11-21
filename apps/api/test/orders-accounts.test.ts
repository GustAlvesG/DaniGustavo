import {
  and,
  eq,
  events,
  giftOrders,
  gifts,
  inArray,
  messages,
  paymentAccounts,
  payments,
  webhookEvents,
} from "@casamento/db";
import { ApiError, GiftsResponse, maskDocument, OrderView } from "@casamento/shared";
import { ulid } from "ulid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newWebhookToken, secretBoxFromEnv, sha256Hex } from "../src/crypto/secret-box.ts";
import type { Mailer } from "../src/mailer.ts";
import type { Notifier } from "../src/orders/notify.ts";
import { reconcileOrders, refundOrder } from "../src/orders/reconcile.ts";
import {
  expirePendingOrders,
  PAYMENTS_UNAVAILABLE_MESSAGE,
  type OrderDeps,
} from "../src/orders/service.ts";
import { providerForOrder, resolveEventReceiver } from "../src/payment-accounts/resolve.ts";
import { sealAccountApiKey } from "../src/payment-accounts/store.ts";
import {
  createSimulatedProvider,
  SIMULATED_PLATFORM_WALLET,
  WEBHOOK_TOKEN_HEADER,
} from "../src/payments/index.ts";
import type { EventCtx } from "../src/tenancy/types.ts";
import { createTestEvents, TEST_WEB_KEY, testApp, type TestEvents } from "./helpers.ts";

/*
 * Fase 5, frente B: cobranças roteadas pela conta recebedora do evento (subconta da organização
 * ou do anfitrião, ou a conta principal com `platform`), split da plataforma gravado no pedido,
 * webhook por conta, conciliação, expiração e reembolso pela conta do pedido.
 */

const mailer: Mailer = { send: () => Promise.resolve() };
const notifier: Notifier = { telegram: () => Promise.resolve() };
let clock = new Date();
const provider = createSimulatedProvider({ webhookSecret: `simulado:${TEST_WEB_KEY}` });
const { app, db, env } = testApp(
  { mailer, notifier, provider, now: () => clock, revalidate: () => Promise.resolve() },
  { PLATFORM_FEE_PERCENT: "2.5" },
);
const secrets = secretBoxFromEnv(env);
const deps: OrderDeps = { env, db, provider, mailer, notifier, now: () => clock, secrets };

const run = Date.now().toString(36);
let T: TestEvents;
let n = 0;
const ip = () => `10.77.${Math.floor(++n / 250)}.${(n % 250) + 1}`;
const hookIds = new Set<string>();

interface TestAccount {
  id: number;
  publicId: string;
  token: string;
  walletId: string;
}

/** Subconta criada no simulado e gravada como o serviço da frente C grava (apiKey cifrada). */
async function createAccount(
  orgId: number,
  opts: { email?: string; userId?: string } = {},
): Promise<TestAccount> {
  const publicId = ulid();
  const token = newWebhookToken();
  const email = opts.email ?? `conta-${run}-${++n}@exemplo.com`;
  const created = await provider.createSubaccount!({
    personType: "individual",
    name: "Conta de Teste",
    document: "52998224725",
    email,
    mobilePhone: "24999998888",
    birthDate: "1990-01-01",
    incomeCents: 500000,
    address: { postalCode: "27200000", street: "Rua A", number: "1", district: "Centro" },
    webhook: {
      url: `http://localhost/api/webhooks/payments/accounts/${publicId}`,
      authToken: token,
      email,
    },
  });
  const status = created.status!.status;
  const [res] = await db.insert(paymentAccounts).values({
    organizationId: orgId,
    holder: opts.userId ? "user" : "organization",
    userId: opts.userId ?? null,
    provider: "simulado",
    publicId,
    providerAccountId: created.providerAccountId,
    walletId: created.walletId,
    apiKeyEnc: sealAccountApiKey(secrets, publicId, created.apiKey),
    webhookTokenHash: sha256Hex(token),
    personType: "individual",
    name: "Conta de Teste",
    email,
    documentHint: maskDocument("52998224725"),
    status,
    kyc: created.status!.kyc,
    approvedAt: status === "approved" ? new Date() : null,
  });
  return { id: res.insertId, publicId, token, walletId: created.walletId };
}

async function setReceiver(
  ev: EventCtx,
  receiver: "organization" | "host" | "platform",
  accountId: number | null = null,
) {
  await db
    .update(events)
    .set({ paymentReceiver: receiver, receivingAccountId: accountId })
    .where(and(eq(events.id, ev.id), eq(events.organizationId, ev.orgId)));
}

async function makeGift(ev: EventCtx, priceCents = 10000) {
  const slug = `conta-${run}-${++n}`;
  await db.insert(gifts).values({
    eventId: ev.id,
    slug,
    title: `Presente ${n}`,
    priceCents,
    openAmount: false,
    quotaTotal: 5,
    category: "casa",
    tileDesign: "flor",
    sort: 9999,
  });
  return slug;
}

const postOrder = (ev: EventCtx, giftSlug: string, extra: Record<string, unknown> = {}) =>
  app.request(`/api/e/${ev.slug}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Web-Key": TEST_WEB_KEY, "X-Client-Ip": ip() },
    body: JSON.stringify({
      giftSlug,
      quantity: 1,
      buyerName: "Bia Teste",
      buyerEmail: "bia@exemplo.com",
      showOnWall: false,
      ...extra,
    }),
  });

async function orderRow(ev: EventCtx, publicId: string) {
  const [row] = await db
    .select()
    .from(giftOrders)
    .where(and(eq(giftOrders.publicId, publicId), eq(giftOrders.eventId, ev.id)));
  return row!;
}

async function createPaidReady(ev: EventCtx) {
  const res = await postOrder(ev, await makeGift(ev));
  expect(res.status).toBe(201);
  return OrderView.parse(await res.json());
}

/** Webhook no formato do Asaas para a URL de uma conta (ou a global, sem conta). */
function hook(
  chargeId: string,
  to: { account?: TestAccount; token?: string } = {},
): Promise<Response> {
  const h = provider.approve(chargeId);
  const body = h.body as { id: string };
  hookIds.add(body.id);
  const path = to.account ? `/api/webhooks/payments/accounts/${to.account.publicId}` : h.path;
  return Promise.resolve(
    app.request(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WEBHOOK_TOKEN_HEADER]: to.token ?? to.account?.token ?? h.headers[WEBHOOK_TOKEN_HEADER]!,
      },
      body: JSON.stringify(body),
    }),
  );
}

let accA: TestAccount; // conta aprovada da org A
let accB: TestAccount; // conta aprovada da org B
beforeAll(async () => {
  T = await createTestEvents(db);
  accA = await createAccount(T.orgA.id);
  accB = await createAccount(T.orgB.id);
});
beforeEach(() => {
  clock = new Date();
});

afterAll(async () => {
  const eventIds = [T.eventA.id, T.eventB.id, T.draftA.id];
  for (const ev of [T.eventA, T.eventB, T.draftA]) await setReceiver(ev, "platform");
  await db.delete(payments).where(inArray(payments.eventId, eventIds));
  await db.delete(messages).where(inArray(messages.eventId, eventIds));
  await db.delete(giftOrders).where(inArray(giftOrders.eventId, eventIds));
  await db.delete(gifts).where(inArray(gifts.eventId, eventIds));
  for (const id of hookIds) await db.delete(webhookEvents).where(eq(webhookEvents.eventId, id));
  for (const orgId of [T.orgA.id, T.orgB.id]) {
    await db.delete(paymentAccounts).where(eq(paymentAccounts.organizationId, orgId));
  }
  await T.cleanup();
  await db.$client.end();
});

describe("evento da organização com conta aprovada", () => {
  it("cobra na subconta com o split da plataforma e grava a conta e a taxa no pedido", async () => {
    await setReceiver(T.eventA, "organization");
    const list = GiftsResponse.parse(
      await (await app.request(`/api/e/${T.eventA.slug}/gifts`)).json(),
    );
    expect(list.paymentsAvailable).toBe(true);

    const view = await createPaidReady(T.eventA);
    const row = await orderRow(T.eventA, view.publicId);
    expect(row.paymentAccountId).toBe(accA.id);
    expect(row.platformFeeBps).toBe(250);
    expect(provider.accountOf(row.providerOrderId!)).toBe(accA.walletId);
    const charge = await provider.getCharge(row.providerOrderId!);
    expect(charge.split).toEqual([
      expect.objectContaining({
        walletId: SIMULATED_PLATFORM_WALLET,
        percent: 2.5,
        totalCents: 250,
      }),
    ]);

    // Webhook da própria conta (token dela): pago, com o repasse informado gravado.
    const res = await hook(row.providerOrderId!, { account: accA });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ changedTo: "paid" });
    const paid = await orderRow(T.eventA, view.publicId);
    expect(paid.status).toBe("paid");
    expect(paid.platformFeeCents).toBe(250);
  });

  it("cartão do simulado também vai com o split e paga na hora", async () => {
    await setReceiver(T.eventA, "organization");
    const res = await postOrder(T.eventA, await makeGift(T.eventA, 20000), {
      method: "card",
      card: {
        token: "sim_1111_x",
        paymentMethodId: "visa",
        paymentType: "credit_card",
        installments: 1,
        coverFee: false,
      },
    });
    expect(res.status).toBe(201);
    const view = OrderView.parse(await res.json());
    const row = await orderRow(T.eventA, view.publicId);
    expect(row.status).toBe("paid");
    expect(row.paymentAccountId).toBe(accA.id);
    expect(provider.accountOf(row.providerOrderId!)).toBe(accA.walletId);
    expect(row.platformFeeCents).toBe(500);
  });

  it("o simular pagamento (webhook global) também paga pedido de subconta, conferindo na subconta", async () => {
    await setReceiver(T.eventA, "organization");
    const view = await createPaidReady(T.eventA);
    const row = await orderRow(T.eventA, view.publicId);
    const before = provider.operations().length;
    const res = await hook(row.providerOrderId!);
    expect(await res.json()).toMatchObject({ changedTo: "paid" });
    const ops = provider.operations().slice(before);
    expect(ops).toContainEqual({
      op: "getCharge",
      account: accA.walletId,
      id: row.providerOrderId,
    });
  });
});

describe("evento em platform (como o casamento)", () => {
  it("cobra na conta principal, sem split nem taxa", async () => {
    await setReceiver(T.eventA, "platform");
    const view = await createPaidReady(T.eventA);
    const row = await orderRow(T.eventA, view.publicId);
    expect(row.paymentAccountId).toBeNull();
    expect(row.platformFeeBps).toBe(0);
    expect(provider.accountOf(row.providerOrderId!)).toBeNull();
    expect((await provider.getCharge(row.providerOrderId!)).split).toBeNull();
    await hook(row.providerOrderId!);
    const paid = await orderRow(T.eventA, view.publicId);
    expect(paid.status).toBe("paid");
    expect(paid.platformFeeCents).toBeNull();
  });
});

describe("evento sem conta pronta", () => {
  it("sem conta da organização: lista avisa e o pedido recebe 409 sem reservar nada", async () => {
    await setReceiver(T.eventB, "platform");
    const slug = await makeGift(T.eventB);
    // Org B tem conta, mas o evento aponta para "host" sem conta escolhida.
    await setReceiver(T.eventB, "host", null);
    const list = GiftsResponse.parse(
      await (await app.request(`/api/e/${T.eventB.slug}/gifts`)).json(),
    );
    expect(list.paymentsAvailable).toBe(false);
    const res = await postOrder(T.eventB, slug);
    expect(res.status).toBe(409);
    expect(ApiError.parse(await res.json()).error.message).toBe(PAYMENTS_UNAVAILABLE_MESSAGE);
    const [g] = await db
      .select()
      .from(gifts)
      .where(and(eq(gifts.slug, slug), eq(gifts.eventId, T.eventB.id)));
    expect(g!.quotaSold).toBe(0);
  });

  it("conta pendente, em análise ou recusada: 409", async () => {
    for (const tag of ["pendente", "analise", "recusada"]) {
      const acc = await createAccount(T.orgA.id, {
        email: `x+${tag}-${run}@exemplo.com`,
        userId: T.users.host.id,
      });
      await setReceiver(T.eventA, "host", acc.id);
      expect((await resolveEventReceiver(T.eventA, { env, db, provider, secrets })).ok).toBe(false);
      expect((await postOrder(T.eventA, await makeGift(T.eventA))).status).toBe(409);
      await db
        .update(paymentAccounts)
        .set({ disabledAt: new Date(), status: "disabled" })
        .where(and(eq(paymentAccounts.id, acc.id), eq(paymentAccounts.organizationId, T.orgA.id)));
    }
  });

  it("conta do anfitrião aprovada: cobra nela", async () => {
    const acc = await createAccount(T.orgA.id, { userId: T.users.member.id });
    await setReceiver(T.eventA, "host", acc.id);
    const view = await createPaidReady(T.eventA);
    const row = await orderRow(T.eventA, view.publicId);
    expect(row.paymentAccountId).toBe(acc.id);
    expect(provider.accountOf(row.providerOrderId!)).toBe(acc.walletId);
    await db
      .update(paymentAccounts)
      .set({ disabledAt: new Date(), status: "disabled" })
      .where(and(eq(paymentAccounts.id, acc.id), eq(paymentAccounts.organizationId, T.orgA.id)));
    // Conta desativada: o evento fica sem conta (pedidos novos 409)...
    expect((await postOrder(T.eventA, await makeGift(T.eventA))).status).toBe(409);
    // ...mas o pedido antigo continua falando com ela (webhook pago).
    const res = await hook(row.providerOrderId!, { account: acc });
    expect(await res.json()).toMatchObject({ changedTo: "paid" });
  });
});

describe("webhook por conta", () => {
  it("token errado ou de outra conta → 401; conta inexistente → 404", async () => {
    await setReceiver(T.eventB, "organization");
    const view = await createPaidReady(T.eventB);
    const row = await orderRow(T.eventB, view.publicId);
    expect((await hook(row.providerOrderId!, { account: accB, token: "errado" })).status).toBe(401);
    expect((await hook(row.providerOrderId!, { account: accB, token: accA.token })).status).toBe(
      401,
    );
    const unknown = await app.request(`/api/webhooks/payments/accounts/${ulid()}`, {
      method: "POST",
      headers: { "content-type": "application/json", [WEBHOOK_TOKEN_HEADER]: accB.token },
      body: "{}",
    });
    expect(unknown.status).toBe(404);
    expect((await orderRow(T.eventB, view.publicId)).status).toBe("pending");
  });

  it("aviso na conta A sobre pedido da conta B é ignorado; idempotente na conta certa", async () => {
    await setReceiver(T.eventB, "organization");
    const view = await createPaidReady(T.eventB);
    const row = await orderRow(T.eventB, view.publicId);
    const wrong = await hook(row.providerOrderId!, { account: accA });
    expect(wrong.status).toBe(200);
    expect(await wrong.json()).toMatchObject({ ignored: true });
    expect((await orderRow(T.eventB, view.publicId)).status).toBe("pending");

    const h = provider.approve(row.providerOrderId!);
    const body = JSON.stringify(h.body);
    hookIds.add((h.body as { id: string }).id);
    const send = () =>
      app.request(`/api/webhooks/payments/accounts/${accB.publicId}`, {
        method: "POST",
        headers: { "content-type": "application/json", [WEBHOOK_TOKEN_HEADER]: accB.token },
        body,
      });
    expect(await (await send()).json()).toMatchObject({ changedTo: "paid" });
    expect(await (await send()).json()).toMatchObject({ duplicate: true });
  });
});

describe("conciliação, expiração e reembolso pela conta do pedido", () => {
  it("reembolsa e concilia na subconta do pedido", async () => {
    await setReceiver(T.eventB, "organization");
    const view = await createPaidReady(T.eventB);
    const row = await orderRow(T.eventB, view.publicId);
    await hook(row.providerOrderId!, { account: accB });

    let before = provider.operations().length;
    const refunded = await refundOrder(T.eventB, deps, view.publicId);
    expect(refunded.ok).toBe(true);
    expect((await orderRow(T.eventB, view.publicId)).status).toBe("refunded");
    expect(provider.operations().slice(before)).toContainEqual({
      op: "refund",
      account: accB.walletId,
      id: row.providerOrderId,
    });

    before = provider.operations().length;
    const result = await reconcileOrders(T.eventB, deps);
    expect(result.errors).toBe(0);
    const gets = provider
      .operations()
      .slice(before)
      .filter((o) => o.id === row.providerOrderId);
    expect(gets).toEqual([{ op: "getCharge", account: accB.walletId, id: row.providerOrderId }]);
  });

  it("expira e cancela a cobrança na subconta do pedido", async () => {
    await setReceiver(T.eventB, "organization");
    const view = await createPaidReady(T.eventB);
    const row = await orderRow(T.eventB, view.publicId);
    clock = new Date(Date.now() + 31 * 60_000);
    const before = provider.operations().length;
    expect(await expirePendingOrders(deps, T.eventB.id)).toBeGreaterThanOrEqual(1);
    expect((await orderRow(T.eventB, view.publicId)).status).toBe("expired");
    const ops = provider.operations().slice(before);
    expect(ops.some((o) => o.account === accB.walletId && o.id === row.providerOrderId)).toBe(true);
    expect(ops.some((o) => o.account === null)).toBe(false);
  });
});

describe("isolamento entre eventos", () => {
  it("a conta de um pedido só é achada na organização do evento", async () => {
    await expect(
      providerForOrder(T.eventA, { env, db, provider, secrets }, { paymentAccountId: accB.id }),
    ).rejects.toThrow();
    const sub = await providerForOrder(
      T.eventB,
      { env, db, provider, secrets },
      { paymentAccountId: accB.id },
    );
    expect(sub).not.toBe(provider);
  });
});
