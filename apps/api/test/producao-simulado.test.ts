import {
  and,
  eq,
  giftOrders,
  gifts,
  guests,
  inArray,
  invitations,
  organizationSubscriptions,
} from "@casamento/db";
import { GiftsResponse, PAST_DUE_GRACE_DAYS, type MeResponse } from "@casamento/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSubscriptionProvider } from "../src/billing/index.ts";
import { billingLive, paymentsLive } from "../src/env.ts";
import type { Mailer } from "../src/mailer.ts";
import { runSubscriptionRound } from "../src/plans/subscriptions.ts";
import type { EventCtx } from "../src/tenancy/types.ts";
import { createTestEvents, TEST_WEB_KEY, testApp, type TestEvents } from "./helpers.ts";
import { clearSubscription, createPlan, DAY, dropPlans, setSubscription } from "./plan-fixtures.ts";

/*
 * Produção sem Asaas (PAYMENT_PROVIDER/BILLING_PROVIDER=simulado com NODE_ENV=production): nenhum
 * pagamento de mentira (presentes em dinheiro indisponíveis, POST /orders 409) e nenhuma
 * cobrança/inadimplência da assinatura simulada (sem 402 por atraso ou fim do teste). Fora de
 * produção o simulado continua como sempre (dev, CI, e2e).
 */

const mailer: Mailer = { send: () => Promise.resolve() };
const noRevalidate = () => Promise.resolve();
const prod = testApp(
  { mailer, revalidate: noRevalidate },
  { NODE_ENV: "production", PAYMENT_SECRETS_KEY: "ab".repeat(32) },
);
const dev = testApp({ mailer, revalidate: noRevalidate });
const db = prod.db;
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PLAN = `t-prod-sim-${run}`;
let T: TestEvents;
let n = 0;
const cookies: { prod: string; dev: string } = { prod: "", dev: "" };

async function makeGift(ev: EventCtx) {
  const slug = `prod-sim-${run}-${++n}`;
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

const postOrder = (which: typeof prod, ev: EventCtx, giftSlug: string) =>
  which.app.request(`/api/e/${ev.slug}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Web-Key": TEST_WEB_KEY,
      "X-Client-Ip": `10.88.0.${++n % 250}`,
    },
    body: JSON.stringify({
      giftSlug,
      quantity: 1,
      buyerName: "Bia Teste",
      buyerEmail: "bia@exemplo.com",
      showOnWall: false,
    }),
  });

const admin = (which: "prod" | "dev", method: string, path: string, body?: unknown) =>
  (which === "prod" ? prod : dev).app.request(`/api/admin${path}`, {
    method,
    headers: { cookie: cookies[which], "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const invitation = (label: string) => ({
  label,
  side: "noiva",
  maxGuests: 1,
  guests: [{ name: `Pessoa ${label}` }],
});

async function subRow() {
  const [row] = await db
    .select()
    .from(organizationSubscriptions)
    .where(eq(organizationSubscriptions.organizationId, T.orgA.id));
  return row!;
}

beforeAll(async () => {
  T = await createTestEvents(db, { paymentReceiver: "platform" });
  cookies.prod = await T.login(prod.app, "owner");
  cookies.dev = await T.login(dev.app, "owner");
  await createPlan(db, { code: PLAN });
});

beforeEach(async () => {
  await clearSubscription(db, T.orgA.id);
});

afterAll(async () => {
  const eventIds = [T.eventA.id, T.eventB.id, T.draftA.id];
  await db.delete(giftOrders).where(inArray(giftOrders.eventId, eventIds));
  await db.delete(gifts).where(inArray(gifts.eventId, eventIds));
  await db.delete(guests).where(eq(guests.eventId, T.eventA.id));
  await db.delete(invitations).where(eq(invitations.eventId, T.eventA.id));
  await T.cleanup();
  await dropPlans(db, [PLAN]);
  await prod.db.$client.end();
  await dev.db.$client.end();
});

describe("paymentsLive / billingLive", () => {
  it("só produção com o simulado desliga; dev/test com simulado e produção com asaas seguem", () => {
    for (const NODE_ENV of ["development", "test"] as const) {
      expect(paymentsLive({ NODE_ENV, PAYMENT_PROVIDER: "simulado" })).toBe(true);
      expect(billingLive({ NODE_ENV, BILLING_PROVIDER: "simulado" })).toBe(true);
    }
    expect(paymentsLive({ NODE_ENV: "production", PAYMENT_PROVIDER: "simulado" })).toBe(false);
    expect(billingLive({ NODE_ENV: "production", BILLING_PROVIDER: "simulado" })).toBe(false);
    expect(paymentsLive({ NODE_ENV: "production", PAYMENT_PROVIDER: "asaas" })).toBe(true);
    expect(billingLive({ NODE_ENV: "production", BILLING_PROVIDER: "asaas" })).toBe(true);
  });
});

describe("produção com PAYMENT_PROVIDER=simulado", () => {
  it("presentes em dinheiro indisponíveis e POST /orders 409, sem reservar cota", async () => {
    const slug = await makeGift(T.eventA);
    const list = GiftsResponse.parse(
      await (await prod.app.request(`/api/e/${T.eventA.slug}/gifts`)).json(),
    );
    expect(list.paymentsAvailable).toBe(false);
    expect(list.gifts.some((g) => g.slug === slug)).toBe(true);
    expect((await postOrder(prod, T.eventA, slug)).status).toBe(409);
    const [g] = await db
      .select()
      .from(gifts)
      .where(and(eq(gifts.slug, slug), eq(gifts.eventId, T.eventA.id)));
    expect(g!.quotaSold).toBe(0);
  });

  it("fora de produção o simulado segue aceitando pedidos", async () => {
    const slug = await makeGift(T.eventA);
    const list = GiftsResponse.parse(
      await (await dev.app.request(`/api/e/${T.eventA.slug}/gifts`)).json(),
    );
    expect(list.paymentsAvailable).toBe(true);
    expect((await postOrder(dev, T.eventA, slug)).status).toBe(201);
  });

  it("o /me avisa o painel (pagamentos e cobrança inativos só em produção)", async () => {
    const prodMe = (await (await admin("prod", "GET", "/me")).json()) as MeResponse;
    expect(prodMe.platform).toEqual({ paymentsActive: false, billingActive: false });
    const devMe = (await (await admin("dev", "GET", "/me")).json()) as MeResponse;
    expect(devMe.platform).toEqual({ paymentsActive: true, billingActive: true });
  });
});

describe("produção com BILLING_PROVIDER=simulado", () => {
  const overdue = () =>
    setSubscription(db, T.orgA.id, PLAN, {
      status: "past_due",
      pastDueSince: new Date(Date.now() - (PAST_DUE_GRACE_DAYS + 5) * DAY),
    });

  it("atraso além da carência não bloqueia o painel (sem 402) nem aparece como atraso", async () => {
    await overdue();
    const ev = `/events/${T.eventA.id}/invitations`;
    expect((await admin("prod", "POST", ev, invitation(`Prod ${run}`))).status).toBe(201);
    const view = (await (await admin("prod", "GET", `/orgs/${T.orgA.id}/subscription`)).json()) as {
      readOnly: boolean;
      pastDueSince: string | null;
      billingActive: boolean;
    };
    expect(view).toMatchObject({ readOnly: false, pastDueSince: null, billingActive: false });
    // Fora de produção a inadimplência continua valendo.
    expect((await admin("dev", "POST", ev, invitation(`Dev ${run}`))).status).toBe(402);
    const devView = (await (
      await admin("dev", "GET", `/orgs/${T.orgA.id}/subscription`)
    ).json()) as { readOnly: boolean; billingActive: boolean };
    expect(devView).toMatchObject({ readOnly: true, billingActive: true });
  });

  it("fim do teste não vira atraso na rotina (só fora de produção)", async () => {
    const trial = () =>
      setSubscription(db, T.orgA.id, PLAN, {
        status: "trialing",
        trialEndsAt: new Date(Date.now() - DAY),
      });
    await trial();
    const deps = (env: typeof prod.env) => ({
      env,
      db,
      billing: createSubscriptionProvider(env),
      mailer,
      now: () => new Date(),
    });
    await runSubscriptionRound(deps(prod.env));
    expect((await subRow()).status).toBe("trialing");
    await runSubscriptionRound(deps(dev.env));
    expect((await subRow()).status).toBe("past_due");
  });

  it("escolher um plano pago não cria cobrança no provedor", async () => {
    const res = await admin("prod", "POST", `/orgs/${T.orgA.id}/subscription`, {
      planCode: PLAN,
      billingCycle: "monthly",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { invoiceUrl: string | null };
    expect(body.invoiceUrl).toBeNull();
    const row = await subRow();
    expect(row.providerSubscriptionId).toBeNull();
    expect(row.provider).toBeNull();
  });
});
