import {
  and,
  eq,
  events,
  giftOrders,
  gifts,
  inArray,
  paymentAccounts,
  payments,
  plans,
} from "@casamento/db";
import {
  COURTESY_PLAN_CODE,
  maskDocument,
  OrderView,
  type PublicPlansResponse,
} from "@casamento/shared";
import { ulid } from "ulid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newWebhookToken, secretBoxFromEnv, sha256Hex } from "../src/crypto/secret-box.ts";
import type { Mailer } from "../src/mailer.ts";
import { eventPaymentState, resolveEventReceiver } from "../src/payment-accounts/resolve.ts";
import { sealAccountApiKey } from "../src/payment-accounts/store.ts";
import { createSimulatedProvider, type PaymentProvider } from "../src/payments/index.ts";
import { organizationFeeBps } from "../src/plans/fees.ts";
import type { EventCtx } from "../src/tenancy/types.ts";
import { createTestEvents, TEST_WEB_KEY, testApp, type TestEvents } from "./helpers.ts";
import { clearSubscription, createPlan, dropPlans, setSubscription } from "./plan-fixtures.ts";

/*
 * Fase 6, frente A: página de preços (GET /api/plans) e taxa da plataforma vinda do plano da
 * organização (override negociado > plano > PLATFORM_FEE_PERCENT sem assinatura), gravada no
 * pedido; sem carteira da plataforma com taxa > 0, o evento fica sem presentes em dinheiro.
 */

const mailer: Mailer = { send: () => Promise.resolve() };
const provider = createSimulatedProvider({ webhookSecret: `simulado:${TEST_WEB_KEY}` });
const { app, db, env } = testApp(
  { mailer, provider, revalidate: () => Promise.resolve() },
  { PLATFORM_FEE_PERCENT: "0.5" },
);
const secrets = secretBoxFromEnv(env);
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PUB = `t-pub-${run}`;
const HIDDEN = `t-oculto-${run}`;
const OFF = `t-inativo-${run}`;
const FEE3 = `t-taxa-${run}`;

let T: TestEvents;
let n = 0;

async function createAccount(orgId: number, providerName = "simulado") {
  const publicId = ulid();
  const email = `conta-plano-${run}-${++n}@exemplo.com`;
  let walletId = `wallet-${run}-${n}`;
  let apiKey = `chave-${run}-${n}`;
  let providerAccountId = `acc-${run}-${n}`;
  if (providerName === "simulado") {
    const created = await provider.createSubaccount!({
      personType: "individual",
      name: "Conta de Teste",
      document: "52998224725",
      email,
      mobilePhone: "24999998888",
      birthDate: "1990-01-01",
      incomeCents: 500000,
      address: { postalCode: "27200000", street: "Rua A", number: "1", district: "Centro" },
      webhook: { url: `http://localhost/x/${publicId}`, authToken: newWebhookToken(), email },
    });
    walletId = created.walletId;
    apiKey = created.apiKey;
    providerAccountId = created.providerAccountId;
  }
  const [res] = await db.insert(paymentAccounts).values({
    organizationId: orgId,
    holder: "organization",
    provider: providerName as "simulado",
    publicId,
    providerAccountId,
    walletId,
    apiKeyEnc: sealAccountApiKey(secrets, publicId, apiKey),
    webhookTokenHash: sha256Hex(newWebhookToken()),
    personType: "individual",
    name: "Conta de Teste",
    email,
    documentHint: maskDocument("52998224725"),
    status: "approved",
    kyc: null,
    approvedAt: new Date(),
  });
  return res.insertId;
}

async function makeGift(ev: EventCtx) {
  const slug = `plano-${run}-${++n}`;
  await db.insert(gifts).values({
    eventId: ev.id,
    slug,
    title: `Presente ${n}`,
    priceCents: 10000,
    openAmount: false,
    quotaTotal: 5,
    category: "casa",
    tileDesign: "flor",
    sort: 9999,
  });
  return slug;
}

beforeAll(async () => {
  T = await createTestEvents(db);
  await createPlan(db, { code: PUB, feeBps: 120 });
  await createPlan(db, { code: HIDDEN, public: false });
  await createPlan(db, { code: OFF });
  await db.update(plans).set({ active: false }).where(eq(plans.code, OFF));
  await createPlan(db, { code: FEE3, feeBps: 300 });
});

beforeEach(async () => {
  await clearSubscription(db, T.orgA.id);
  await clearSubscription(db, T.orgB.id);
});

afterAll(async () => {
  const eventIds = [T.eventA.id, T.eventB.id, T.draftA.id];
  await db.delete(payments).where(inArray(payments.eventId, eventIds));
  await db.delete(giftOrders).where(inArray(giftOrders.eventId, eventIds));
  await db.delete(gifts).where(inArray(gifts.eventId, eventIds));
  await T.cleanup();
  await dropPlans(db, [PUB, HIDDEN, OFF, FEE3]);
  await db.$client.end();
});

describe("GET /api/plans", () => {
  it("lista só planos públicos e ativos, com cache curto", async () => {
    const res = await app.request("/api/plans");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/max-age=\d+/);
    const body = (await res.json()) as PublicPlansResponse;
    const codes = body.plans.map((p) => p.code);
    expect(codes).toContain(PUB);
    expect(codes).toContain("essencial");
    expect(codes).not.toContain(HIDDEN);
    expect(codes).not.toContain(OFF);
    expect(codes).not.toContain(COURTESY_PLAN_CODE);
    const pub = body.plans.find((p) => p.code === PUB)!;
    expect(pub).toMatchObject({ feeBps: 120, priceMonthlyCents: 4990 });
    expect(pub.limits).toEqual({
      activeEvents: null,
      guestsPerEvent: null,
      members: null,
      storageMb: null,
      modules: null,
    });
  });
});

describe("taxa da plataforma pelo plano", () => {
  it("sem assinatura = .env; plano; override; Cortesia = 0", async () => {
    expect(await organizationFeeBps(db, env, T.orgA.id)).toBe(50);
    await setSubscription(db, T.orgA.id, FEE3);
    expect(await organizationFeeBps(db, env, T.orgA.id)).toBe(300);
    await setSubscription(db, T.orgA.id, FEE3, { feeBpsOverride: 75 });
    expect(await organizationFeeBps(db, env, T.orgA.id)).toBe(75);
    await setSubscription(db, T.orgA.id, COURTESY_PLAN_CODE, { status: "internal" });
    expect(await organizationFeeBps(db, env, T.orgA.id)).toBe(0);
    // Isolamento: a org B segue sem assinatura.
    expect(await organizationFeeBps(db, env, T.orgB.id)).toBe(50);
  });

  it("o pedido grava a taxa do plano da organização e o split com ela", async () => {
    const accountId = await createAccount(T.orgA.id);
    await db
      .update(events)
      .set({ paymentReceiver: "organization", receivingAccountId: null })
      .where(and(eq(events.id, T.eventA.id), eq(events.organizationId, T.orgA.id)));
    await setSubscription(db, T.orgA.id, FEE3);

    const deps = { env, db, provider, secrets };
    const resolved = await resolveEventReceiver(T.eventA, deps);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.charge.accountId).toBe(accountId);
      expect(resolved.charge.feeBps).toBe(300);
      expect(resolved.charge.split).toEqual([expect.objectContaining({ percent: 3 })]);
    }

    const res = await app.request(`/api/e/${T.eventA.slug}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Web-Key": TEST_WEB_KEY,
        "X-Client-Ip": "10.88.0.1",
      },
      body: JSON.stringify({
        giftSlug: await makeGift(T.eventA),
        quantity: 1,
        buyerName: "Bia Teste",
        buyerEmail: "bia@exemplo.com",
        showOnWall: false,
      }),
    });
    expect(res.status).toBe(201);
    const order = OrderView.parse(await res.json());
    const [row] = await db
      .select()
      .from(giftOrders)
      .where(and(eq(giftOrders.publicId, order.publicId), eq(giftOrders.eventId, T.eventA.id)));
    expect(row!.platformFeeBps).toBe(300);

    // Cortesia: taxa 0, sem split.
    await setSubscription(db, T.orgA.id, COURTESY_PLAN_CODE, { status: "internal" });
    const free = await resolveEventReceiver(T.eventA, deps);
    expect(free.ok && free.charge.feeBps).toBe(0);
    expect(free.ok && free.charge.split).toEqual([]);
  });

  it("taxa > 0 sem carteira da plataforma → sem presentes em dinheiro", async () => {
    const asaasLike: PaymentProvider = {
      ...provider,
      name: "asaas",
      forAccount: () => asaasLike,
    } as PaymentProvider;
    const accountId = await createAccount(T.orgB.id, "asaas");
    await db
      .update(events)
      .set({ paymentReceiver: "organization", receivingAccountId: null })
      .where(and(eq(events.id, T.eventB.id), eq(events.organizationId, T.orgB.id)));
    const deps = { env, db, provider: asaasLike, secrets };
    await setSubscription(db, T.orgB.id, FEE3);
    expect(await resolveEventReceiver(T.eventB, deps)).toEqual({ ok: false, state: "no_account" });
    expect(await eventPaymentState(T.eventB, deps)).toBe("no_account");
    // Taxa 0 (Cortesia): pronto, mesmo sem carteira.
    await setSubscription(db, T.orgB.id, COURTESY_PLAN_CODE, { status: "internal" });
    expect(await eventPaymentState(T.eventB, deps)).toBe("ready");
    await db.delete(paymentAccounts).where(eq(paymentAccounts.id, accountId));
  });
});
