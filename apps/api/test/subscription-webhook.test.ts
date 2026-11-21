import {
  eq,
  guests,
  invitations,
  newPublicId,
  organizations,
  organizationSubscriptions,
  webhookEvents,
} from "@casamento/db";
import { ERROR_CODES, PAST_DUE_GRACE_DAYS } from "@casamento/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createSubscriptionProvider,
  isSimulatedBilling,
  type SimulatedBilling,
} from "../src/billing/index.ts";
import type { MailMessage, Mailer } from "../src/mailer.ts";
import { WEBHOOK_TOKEN_HEADER } from "../src/payments/provider.ts";
import { createTestEvents, TEST_WEB_KEY, testApp, type TestEvents } from "./helpers.ts";
import { clearSubscription, createPlan, DAY, dropPlans, setSubscription } from "./plan-fixtures.ts";

/*
 * Fase 6, frente A: webhook da assinatura (token, idempotência, status consultado no provedor)
 * e o gate da inadimplência: depois da carência o painel fica só leitura (402), menos a própria
 * assinatura e o platform admin; o site dos convidados, o RSVP e os pedidos nunca passam por ele.
 */

const sent: MailMessage[] = [];
const mailer: Mailer = { send: (m) => (sent.push(m), Promise.resolve()) };
const { app, db, env } = testApp({ mailer, revalidate: () => Promise.resolve() });
const provided = createSubscriptionProvider(env);
if (!isSimulatedBilling(provided)) throw new Error("esperava o provedor simulado");
const billing: SimulatedBilling = provided;
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PLAN = `t-wh-${run}`;

let T: TestEvents;
const cookies: Record<string, string> = {};
const hookIds: string[] = [];

const orgCall = (who: string, method: string, path: string, body?: unknown) =>
  app.request(`/api/admin/orgs/${T.orgA.id}${path}`, {
    method,
    headers: { cookie: cookies[who]!, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const eventCall = (who: string, method: string, path: string, body?: unknown) =>
  app.request(`/api/admin/events/${T.eventA.id}${path}`, {
    method,
    headers: { cookie: cookies[who]!, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const deliver = (body: unknown, token: string | null = `simulado-assinatura:${TEST_WEB_KEY}`) =>
  app.request("/api/webhooks/subscriptions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === null ? {} : { [WEBHOOK_TOKEN_HEADER]: token }),
    },
    body: JSON.stringify(body),
  });

async function subRow() {
  const [row] = await db
    .select()
    .from(organizationSubscriptions)
    .where(eq(organizationSubscriptions.organizationId, T.orgA.id));
  return row!;
}

/** Assinatura real no simulado (pelo painel), com uma cobrança em aberto. */
async function subscribe() {
  const res = await orgCall("owner", "POST", "/subscription", { planCode: PLAN });
  expect(res.status).toBe(200);
  return (await subRow()).providerSubscriptionId!;
}

function hook(remote: string, outcome: "paid" | "overdue") {
  const h = billing.simulate(remote, outcome)!;
  hookIds.push((h.body as { id: string }).id);
  return h.body;
}

const invitation = {
  label: "Família Gate",
  side: "noiva",
  maxGuests: 1,
  guests: [{ name: "Pessoa Gate" }],
};

beforeAll(async () => {
  T = await createTestEvents(db);
  for (const who of ["owner", "member", "platformAdmin"] as const) {
    cookies[who] = await T.login(app, who);
  }
  await createPlan(db, { code: PLAN });
});

beforeEach(async () => {
  sent.length = 0;
  await clearSubscription(db, T.orgA.id);
  await db.update(organizations).set({ status: "active" }).where(eq(organizations.id, T.orgA.id));
});

afterAll(async () => {
  await db.delete(guests).where(eq(guests.eventId, T.eventA.id));
  await db.delete(invitations).where(eq(invitations.eventId, T.eventA.id));
  for (const id of hookIds) {
    await db.delete(webhookEvents).where(eq(webhookEvents.eventId, `assinatura:${id}`));
  }
  await T.cleanup();
  await dropPlans(db, [PLAN]);
  await db.$client.end();
});

describe("webhook da assinatura", () => {
  it("sem token ou com token errado → 401", async () => {
    const body = {
      id: "evt_x",
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_x", subscription: "sub_x" },
    };
    expect((await deliver(body, null)).status).toBe(401);
    expect((await deliver(body, "token-errado")).status).toBe(401);
  });

  it("evento que não interessa ou cobrança avulsa → 200 ignorado", async () => {
    const viewed = await deliver({
      id: `evt_v_${run}`,
      event: "PAYMENT_VIEWED",
      payment: { id: "p", subscription: "s" },
    });
    expect(await viewed.json()).toEqual({ ok: true, ignored: true });
    const single = await deliver({
      id: `evt_a_${run}`,
      event: "PAYMENT_RECEIVED",
      payment: { id: "p" },
    });
    expect(await single.json()).toEqual({ ok: true, ignored: true });
  });

  it("vencida → past_due (com aviso); paga → active; repetido → ignorado", async () => {
    const remote = await subscribe();
    const overdue = hook(remote, "overdue");
    const res = await deliver(overdue);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ organizationId: T.orgA.id, status: "past_due" });
    expect((await subRow()).pastDueSince).not.toBeNull();
    expect(sent.filter((m) => /em atraso/.test(m.subject)).map((m) => m.to)).toEqual([
      T.users.owner.email,
    ]);

    // O mesmo evento de novo: nada muda e nada é reenviado.
    sent.length = 0;
    expect(await (await deliver(overdue)).json()).toEqual({ ok: true, duplicate: true });
    expect(sent).toHaveLength(0);

    const paid = await deliver(hook(remote, "paid"));
    expect(await paid.json()).toMatchObject({ status: "active" });
    const row = await subRow();
    expect(row.status).toBe("active");
    expect(row.pastDueSince).toBeNull();
    expect(row.currentPeriodEndsAt).not.toBeNull();
    expect(sent.some((m) => /confirmado/.test(m.subject))).toBe(true);
  });

  it("o status vem do provedor, não do corpo do aviso", async () => {
    const remote = await subscribe();
    // Aviso de "pago" sem nada pago no provedor: a assinatura não muda.
    const res = await deliver({
      id: `evt_falso_${run}`,
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_inventado", subscription: remote },
    });
    hookIds.push(`evt_falso_${run}`);
    expect(res.status).toBe(200);
    const row = await subRow();
    expect(row.status).toBe("active");
    expect(row.currentPeriodEndsAt).toBeNull();
  });

  it("assinatura desconhecida → ignorado", async () => {
    const id = `evt_desc_${run}`;
    hookIds.push(id);
    const res = await deliver({
      id,
      event: "PAYMENT_OVERDUE",
      payment: { id: "pay_1", subscription: "sub_que_nao_existe" },
    });
    expect(await res.json()).toEqual({ ok: true, ignored: true });
  });
});

describe("inadimplência: painel só leitura depois da carência", () => {
  const overdueFor = (days: number) =>
    setSubscription(db, T.orgA.id, PLAN, {
      status: "past_due",
      pastDueSince: new Date(Date.now() - days * DAY),
    });

  it("dentro da carência: escritas passam, com a assinatura marcando o atraso", async () => {
    await overdueFor(PAST_DUE_GRACE_DAYS - 1);
    const res = await eventCall("owner", "POST", "/invitations", invitation);
    expect(res.status).toBe(201);
    const view = (await (await orgCall("owner", "GET", "/subscription")).json()) as {
      readOnly: boolean;
      status: string;
    };
    expect(view).toMatchObject({ status: "past_due", readOnly: false });
  });

  it("depois da carência: escrita 402 no evento e na organização; leitura passa", async () => {
    await overdueFor(PAST_DUE_GRACE_DAYS + 1);
    const write = await eventCall("owner", "POST", "/invitations", invitation);
    expect(write.status).toBe(402);
    const body = (await write.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe(ERROR_CODES.subscriptionInactive);
    expect(body.error.message).toMatch(/site dos convidados continua no ar/);
    expect((await eventCall("owner", "GET", "/invitations")).status).toBe(200);
    expect(
      (await orgCall("owner", "PATCH", `/events/${T.draftA.id}`, { status: "archived" })).status,
    ).toBe(402);
    expect((await orgCall("owner", "GET", "/events")).status).toBe(200);
    const view = (await (await orgCall("owner", "GET", "/subscription")).json()) as {
      readOnly: boolean;
    };
    expect(view.readOnly).toBe(true);
  });

  it("depois da carência: a assinatura (pagar/trocar/cancelar) e o platform admin passam", async () => {
    await overdueFor(PAST_DUE_GRACE_DAYS + 1);
    const change = await orgCall("owner", "POST", "/subscription", { planCode: PLAN });
    expect(change.status).not.toBe(402);
    // Trocar de plano não tira do modo só leitura: continua em atraso até pagar.
    expect((await subRow()).status).toBe("past_due");
    const admin = await eventCall("platformAdmin", "POST", "/invitations", {
      ...invitation,
      label: "Família Admin",
    });
    expect(admin.status).toBe(201);
    expect((await orgCall("owner", "POST", "/subscription/cancel")).status).toBe(200);
  });

  it("o site dos convidados, o RSVP e os pedidos nunca passam pelo gate", async () => {
    await overdueFor(PAST_DUE_GRACE_DAYS + 30);
    const token = newPublicId();
    const [inv] = await db.insert(invitations).values({
      eventId: T.eventA.id,
      token,
      label: "Família Pública",
      side: "noiva",
      maxGuests: 1,
    });
    await db
      .insert(guests)
      .values({ eventId: T.eventA.id, invitationId: inv.insertId, name: "Convidada Pública" });
    const pub = (path: string, method = "GET", body?: unknown) =>
      app.request(`/api/e/${T.eventA.slug}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Web-Key": TEST_WEB_KEY,
          "X-Client-Ip": "10.66.0.1",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    // (O convite da fixture não tem as configurações do site: aqui só importa não ser 402.)
    expect((await pub(`/invitations/${token}`)).status).not.toBe(402);
    const rsvp = await pub(`/invitations/${token}/rsvp`, "PUT", { guests: [] });
    expect(rsvp.status).not.toBe(402);
    expect((await pub("/gifts")).status).toBe(200);
    const order = await pub("/orders", "POST", {
      giftSlug: "nao-existe",
      quantity: 1,
      buyerName: "Bia",
      buyerEmail: "bia@exemplo.com",
    });
    expect(order.status).not.toBe(402);
  });

  it("cancelada: só leitura depois do fim do período pago", async () => {
    await setSubscription(db, T.orgA.id, PLAN, {
      status: "canceled",
      canceledAt: new Date(Date.now() - 40 * DAY),
      currentPeriodEndsAt: new Date(Date.now() + DAY),
    });
    expect((await eventCall("owner", "POST", "/invitations", invitation)).status).toBe(201);
    await setSubscription(db, T.orgA.id, PLAN, {
      status: "canceled",
      canceledAt: new Date(Date.now() - 40 * DAY),
      currentPeriodEndsAt: new Date(Date.now() - DAY),
    });
    expect((await eventCall("owner", "POST", "/invitations", invitation)).status).toBe(402);
  });

  it("depois da carência: reembolso, conciliação e privacidade passam do gate", async () => {
    await overdueFor(PAST_DUE_GRACE_DAYS + 1);
    expect((await eventCall("owner", "POST", "/invitations", invitation)).status).toBe(402);
    // Protegem convidados e titulares: chegam à rota (que responde pelo próprio motivo).
    const reconcile = await eventCall("owner", "POST", "/orders/reconcile");
    expect(reconcile.status).toBe(200);
    const refund = await eventCall("owner", "POST", "/orders/nao-existe/refund");
    expect(refund.status).not.toBe(402);
    expect(refund.status).toBe(404);
    // Corpos inválidos: chegam à validação da rota (422/404) sem gravar nada.
    for (const [method, path] of [
      ["PUT", "/privacy/settings"],
      ["PATCH", "/privacy/requests/999999999"],
      ["POST", "/privacy/anonymize"],
    ] as const) {
      const res = await eventCall("owner", method, path, { retentionDays: 1, status: "x" });
      expect(res.status, `${method} ${path}`).not.toBe(402);
      expect([404, 422], `${method} ${path}`).toContain(res.status);
    }
    // Suspensa pelo platform admin: o mesmo.
    await db
      .update(organizations)
      .set({ status: "suspended" })
      .where(eq(organizations.id, T.orgA.id));
    expect((await eventCall("owner", "POST", "/orders/reconcile")).status).toBe(200);
    expect((await eventCall("owner", "POST", "/invitations", invitation)).status).toBe(402);
  });

  it("organização suspensa pelo platform admin: escrita 402, site no ar", async () => {
    await db
      .update(organizations)
      .set({ status: "suspended" })
      .where(eq(organizations.id, T.orgA.id));
    const res = await eventCall("member", "POST", "/invitations", invitation);
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(
      /suspensa/,
    );
    const site = await app.request(`/api/e/${T.eventA.slug}/gifts`, {
      headers: { "X-Web-Key": TEST_WEB_KEY },
    });
    expect(site.status).toBe(200);
  });

  it("isolamento: a inadimplência da org A não trava a org B", async () => {
    await overdueFor(PAST_DUE_GRACE_DAYS + 1);
    const stranger = await T.login(app, "stranger");
    const res = await app.request(`/api/admin/events/${T.eventB.id}/invitations`, {
      method: "POST",
      headers: { cookie: stranger, "Content-Type": "application/json" },
      body: JSON.stringify({ ...invitation, label: "Família B" }),
    });
    expect(res.status).toBe(201);
    await db.delete(guests).where(eq(guests.eventId, T.eventB.id));
    await db.delete(invitations).where(eq(invitations.eventId, T.eventB.id));
  });
});
