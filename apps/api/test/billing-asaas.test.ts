import { readFileSync } from "node:fs";
import { eq, organizationSubscriptions, subscriptionPayments, webhookEvents } from "@casamento/db";
import type { SubscriptionChangeResult } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import {
  createAsaasBilling,
  setSubscriptionProvider,
  SubscriptionProviderError,
  SubscriptionWebhookTokenError,
  type SubscriptionProvider,
} from "../src/billing/index.ts";
import type { Mailer } from "../src/mailer.ts";
import { WEBHOOK_TOKEN_HEADER, type WebhookRequest } from "../src/payments/provider.ts";
import { createTestEvents, testDb, testEnv, type TestEvents } from "./helpers.ts";
import { clearSubscription, createPlan, dropPlans } from "./plan-fixtures.ts";

/*
 * Fase 6, frente A: assinatura no Asaas (API v3, conta principal) com `fetch` trocado por
 * respostas gravadas em test/fixtures/asaas/subscriptions (formato da documentação, nenhum
 * valor real). Nunca chama o Asaas.
 */

const KEY = "$aact_hmlg_000000000000000000000000000000000000000000000000000000000000chave-teste";
const TOKEN = "token-do-webhook-da-assinatura-de-teste-com-32-caracteres";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/asaas/subscriptions/${name}.json`, import.meta.url), "utf8"),
  );

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

/** Responde como o Asaas pelas rotas usadas na assinatura. */
const asaasResponder = (call: Call) => {
  const path = new URL(call.url).pathname;
  if (call.method === "POST" && path.endsWith("/customers"))
    return { body: fixture("customers-create") };
  if (call.method === "POST" && path.endsWith("/subscriptions")) {
    return { body: fixture("subscriptions-create") };
  }
  if (call.method === "PUT") return { body: fixture("subscriptions-update") };
  if (call.method === "DELETE") return { body: fixture("subscriptions-delete") };
  if (call.method === "GET" && path.endsWith("/payments")) {
    return { body: fixture("subscription-payments") };
  }
  return { status: 404, body: { errors: [{ code: "not_found", description: "Não encontrado." }] } };
};

const billingWith = (doFetch: typeof fetch): SubscriptionProvider =>
  createAsaasBilling({ apiKey: KEY, environment: "sandbox", webhookToken: TOKEN, doFetch });

const req = (body: unknown, token: string | undefined = TOKEN): WebhookRequest => ({
  header: (name) => (name === WEBHOOK_TOKEN_HEADER ? token : undefined),
  query: () => undefined,
  body,
});

describe("provedor Asaas (unidade)", () => {
  it("cliente: POST /customers na conta principal, com externalReference da organização", async () => {
    const m = mockFetch(asaasResponder);
    const billing = billingWith(m.fetch);
    const { customerId } = await billing.createCustomer({
      organizationId: 42,
      name: "Organização de Teste",
      email: "dono@exemplo.com",
    });
    expect(customerId).toBe("cus_000000000101");
    const [call] = m.calls;
    expect(call!.url).toBe("https://api-sandbox.asaas.com/v3/customers");
    expect(call!.headers.access_token).toBe(KEY);
    expect(call!.headers["user-agent"]).toMatch(/sandbox/);
    expect(call!.body).toEqual({
      name: "Organização de Teste",
      email: "dono@exemplo.com",
      externalReference: "org:42",
    });
  });

  it("assinatura: valor em reais, billingType UNDEFINED, ciclo e externalReference", async () => {
    const m = mockFetch(asaasResponder);
    const snap = await billingWith(m.fetch).createSubscription({
      customerId: "cus_000000000101",
      organizationId: 42,
      planName: "Teste",
      valueCents: 4990,
      cycle: "monthly",
      nextDueDate: "2026-11-21",
    });
    expect(snap).toMatchObject({
      providerSubscriptionId: "sub_000000000201",
      active: true,
      nextDueDate: "2026-11-21",
    });
    expect(m.calls[0]!.url).toBe("https://api-sandbox.asaas.com/v3/subscriptions");
    expect(m.calls[0]!.body).toEqual({
      customer: "cus_000000000101",
      billingType: "UNDEFINED",
      value: 49.9,
      nextDueDate: "2026-11-21",
      cycle: "MONTHLY",
      description: "Plano Teste",
      externalReference: "org:42",
    });
  });

  it("troca de plano: PUT com updatePendingPayments; cancelar: DELETE", async () => {
    const m = mockFetch(asaasResponder);
    const billing = billingWith(m.fetch);
    await billing.updateSubscription("sub_000000000201", {
      valueCents: 49900,
      cycle: "yearly",
      planName: "Anual",
    });
    expect(m.calls[0]).toMatchObject({
      method: "PUT",
      url: "https://api-sandbox.asaas.com/v3/subscriptions/sub_000000000201",
      body: {
        value: 499,
        cycle: "YEARLY",
        description: "Plano Anual",
        updatePendingPayments: true,
      },
    });
    await billing.cancelSubscription("sub_000000000201");
    expect(m.calls[1]).toMatchObject({ method: "DELETE" });
  });

  it("cobranças: status do Asaas → nosso, valor em centavos, data do pagamento", async () => {
    const m = mockFetch(asaasResponder);
    const list = await billingWith(m.fetch).listPayments("sub_000000000201");
    expect(m.calls[0]!.url).toBe(
      "https://api-sandbox.asaas.com/v3/subscriptions/sub_000000000201/payments?limit=100",
    );
    expect(list.map((p) => [p.providerPaymentId, p.status, p.amountCents, p.dueOn])).toEqual([
      ["pay_000000000301", "paid", 4990, "2026-09-21"],
      ["pay_000000000302", "overdue", 4990, "2026-10-21"],
      ["pay_000000000303", "pending", 4990, "2026-11-21"],
    ]);
    expect(list[0]!.paidAt?.toISOString().slice(0, 10)).toBe("2026-09-20");
    expect(list[2]!.invoiceUrl).toBe("https://sandbox.asaas.com/i/000000000303");
  });

  it("erro do Asaas vira SubscriptionProviderError com o status", async () => {
    const m = mockFetch(() => ({ status: 400, body: fixture("error-invalid-customer") }));
    const err = await billingWith(m.fetch)
      .createSubscription({
        customerId: "cus_x",
        organizationId: 1,
        planName: "X",
        valueCents: 100,
        cycle: "monthly",
        nextDueDate: "2026-11-21",
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SubscriptionProviderError);
    expect((err as SubscriptionProviderError).status).toBe(400);
  });

  it("webhook: token em tempo constante; só cobranças de assinatura", () => {
    const billing = billingWith(mockFetch(asaasResponder).fetch);
    const body = fixture("webhook-payment-overdue");
    expect(() => billing.parseWebhook(req(body, "errado"))).toThrow(SubscriptionWebhookTokenError);
    expect(() => billing.parseWebhook(req(body, ""))).toThrow(SubscriptionWebhookTokenError);
    expect(billing.parseWebhook(req(body))).toEqual({
      eventId: "evt_000000000000000000000000401",
      providerPaymentId: "pay_000000000302",
      providerSubscriptionId: "sub_000000000201",
      type: "PAYMENT_OVERDUE",
    });
    const avulsa = { id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } };
    expect(billing.parseWebhook(req(avulsa))).toBeNull();
  });
});

describe("assinatura pelo Asaas, de ponta a ponta (respostas gravadas)", () => {
  const env = testEnv();
  const m = mockFetch(asaasResponder);
  const billing = billingWith(m.fetch);
  setSubscriptionProvider(env, billing);
  const db = testDb(env.DATABASE_URL);
  const mailer: Mailer = { send: () => Promise.resolve() };
  const app = createApp({
    env,
    db,
    auth: createAuth(env, db),
    billing,
    mailer,
    revalidate: () => Promise.resolve(),
  });
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const PLAN = `t-asaas-${run}`;
  let T: TestEvents;
  let owner = "";

  beforeAll(async () => {
    T = await createTestEvents(db);
    owner = await T.login(app, "owner");
    await createPlan(db, { code: PLAN, priceMonthlyCents: 4990 });
    await clearSubscription(db, T.orgA.id);
  });

  afterAll(async () => {
    await db
      .delete(webhookEvents)
      .where(eq(webhookEvents.eventId, "assinatura:evt_000000000000000000000000401"));
    await T.cleanup();
    await dropPlans(db, [PLAN]);
    await db.$client.end();
  });

  it("escolher plano cria cliente e assinatura; o webhook de vencida põe em atraso", async () => {
    const res = await app.request(`/api/admin/orgs/${T.orgA.id}/subscription`, {
      method: "POST",
      headers: { cookie: owner, "Content-Type": "application/json" },
      body: JSON.stringify({ planCode: PLAN }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as SubscriptionChangeResult;
    // A cobrança vencida mais antiga em aberto é a fatura a pagar.
    expect(body.invoiceUrl).toBe("https://sandbox.asaas.com/i/000000000302");
    expect(m.calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      "POST /v3/customers",
      "POST /v3/subscriptions",
      "GET /v3/subscriptions/sub_000000000201/payments",
    ]);
    expect(m.calls[0]!.body).toMatchObject({
      email: T.users.owner.email,
      externalReference: `org:${T.orgA.id}`,
    });
    expect(m.calls[1]!.body).toMatchObject({ value: 49.9, externalReference: `org:${T.orgA.id}` });

    // As cobranças gravadas já trazem a vencida: a assinatura entrou em atraso na sincronização.
    const [sub] = await db
      .select()
      .from(organizationSubscriptions)
      .where(eq(organizationSubscriptions.organizationId, T.orgA.id));
    expect(sub).toMatchObject({
      provider: "asaas",
      providerCustomerId: "cus_000000000101",
      providerSubscriptionId: "sub_000000000201",
      status: "past_due",
    });
    const pays = await db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.organizationId, T.orgA.id));
    expect(pays).toHaveLength(3);

    // Webhook do Asaas: token certo → processado (status consultado de novo no provedor).
    const hook = (token: string) =>
      app.request("/api/webhooks/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json", [WEBHOOK_TOKEN_HEADER]: token },
        body: JSON.stringify(fixture("webhook-payment-overdue")),
      });
    expect((await hook("errado")).status).toBe(401);
    const before = m.calls.length;
    const ok = await hook(TOKEN);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ organizationId: T.orgA.id, status: "past_due" });
    expect(m.calls.length).toBe(before + 1);
    expect(await (await hook(TOKEN)).json()).toEqual({ ok: true, duplicate: true });
  });
});
