import {
  and,
  eq,
  eventSettings,
  giftOrders,
  gifts,
  guests,
  inArray,
  invitations,
  messages,
  newPublicId,
  rsvpReminders,
  webhookEvents,
} from "@casamento/db";
import { OrderView } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MailMessage, Mailer } from "../src/mailer.ts";
import { createSimulatedProvider } from "../src/payments/index.ts";
import {
  createTestEvents,
  legacySettingsBase,
  setEventSetting,
  TEST_WEB_KEY,
  testApp,
  type TestEvents,
} from "./helpers.ts";

// Lacunas do plano (seção 7) além de isolation/admin-isolation: webhook de pedido de B, painel de
// A mexendo em configurações, recados, pedidos e lembretes de B, e o envio de lembretes por evento.

const sent: MailMessage[] = [];
const mailer: Mailer = {
  send(m) {
    sent.push(m);
    return Promise.resolve();
  },
};
const revalidated: { eventId: number; tags: string[] }[] = [];
const provider = createSimulatedProvider({ webhookSecret: `simulado:${TEST_WEB_KEY}` });
const { app, db } = testApp({
  mailer,
  provider,
  revalidate: (eventId, tags) => {
    revalidated.push({ eventId, tags });
    return Promise.resolve();
  },
});

let T: TestEvents;
let cookieHost: string;
let cookieStranger: string; // dono da org B (sem acesso ao A)
const hookEvents = new Set<string>();
const giftIds = { a: 0, b: 0 };
const inviteIds = { a: 0, b: 0 };
let msgB = 0;

const admin = (eventId: number, path: string, cookie: string, init: RequestInit = {}) =>
  app.request(`/api/admin/events/${eventId}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...init.headers },
  });
const json = (v: unknown) => JSON.stringify(v);

beforeAll(async () => {
  T = await createTestEvents(db);
  cookieHost = await T.login(app, "host");
  cookieStranger = await T.login(app, "stranger");

  // Conteúdo público completo (copiado do evento 1) em A e B: o PUT de configurações o exige válido.
  const base = await legacySettingsBase(db);
  for (const ev of [T.eventA, T.eventB]) {
    await db
      .insert(eventSettings)
      .values(
        base.map((x) => ({ eventId: ev.id, key: x.key, value: x.value, isPublic: x.isPublic })),
      );
  }

  for (const [key, ev] of [
    ["a", T.eventA],
    ["b", T.eventB],
  ] as const) {
    const [g] = await db.insert(gifts).values({
      eventId: ev.id,
      slug: "mesmo-slug",
      title: `Presente de ${key}`,
      priceCents: 1000,
      quotaTotal: 2,
      category: "casa",
      tileDesign: "flor",
    });
    giftIds[key] = g.insertId;
    // Prazo longe, para o envio manual de lembretes valer.
    await setEventSetting(db, ev.id, "rsvp.deadline", "2099-12-31T23:59:59-03:00");
    const [inv] = await db.insert(invitations).values({
      eventId: ev.id,
      token: newPublicId(),
      label: `Convite ${key}`,
      side: "dani",
      maxGuests: 1,
      contactEmail: `${key}-${T.run}@exemplo.com`,
    });
    inviteIds[key] = inv.insertId;
    await db
      .insert(guests)
      .values({ eventId: ev.id, invitationId: inv.insertId, name: `Convidado ${key}` });
  }
  const [m] = await db
    .insert(messages)
    .values({ eventId: T.eventB.id, author: "Autor B", body: `Recado ${T.run}`, approved: true });
  msgB = m.insertId;
  await setEventSetting(db, T.eventA.id, "reminders", { enabled: true, daysBefore: [30] }, false);
  await setEventSetting(db, T.eventA.id, "segredo.privado", "so-do-A", false);
});

afterAll(async () => {
  for (const id of hookEvents) await db.delete(webhookEvents).where(eq(webhookEvents.eventId, id));
  await T.cleanup();
  await db.$client.end();
});

describe("webhook de pedido", () => {
  it("o pedido de B pago pelo webhook muda só o presente, as cotas e o log de B", async () => {
    const res = await app.request(`/api/e/${T.eventB.slug}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Web-Key": TEST_WEB_KEY,
        "X-Client-Ip": "198.51.100.9",
      },
      body: json({
        giftSlug: "mesmo-slug",
        buyerName: "Ana",
        buyerEmail: "ana@exemplo.com",
        quantity: 1,
        method: "pix",
      }),
    });
    expect(res.status).toBe(201);
    const view = OrderView.parse(await res.json());
    const [row] = await db.select().from(giftOrders).where(eq(giftOrders.publicId, view.publicId));
    expect(row!.eventId).toBe(T.eventB.id);

    revalidated.length = 0;
    const hook = provider.approve(row!.providerOrderId!);
    hookEvents.add((hook.body as { id: string }).id);
    const delivered = await app.request(hook.path, {
      method: "POST",
      headers: hook.headers,
      body: JSON.stringify(hook.body),
    });
    expect(delivered.status).toBe(200);

    const [after] = await db.select().from(giftOrders).where(eq(giftOrders.id, row!.id));
    expect(after!.status).toBe("paid");
    const [gA] = await db.select().from(gifts).where(eq(gifts.id, giftIds.a));
    const [gB] = await db.select().from(gifts).where(eq(gifts.id, giftIds.b));
    expect(gB!.quotaSold).toBe(1);
    expect(gA!.quotaSold).toBe(0);
    const hooks = await db
      .select()
      .from(webhookEvents)
      .where(inArray(webhookEvents.eventId, [...hookEvents]));
    expect(hooks.map((h) => h.appEventId)).toEqual([T.eventB.id]);
    // Se alguma invalidação de cache acontecer, é só a de B.
    expect(revalidated.filter((r) => r.eventId !== T.eventB.id)).toEqual([]);
  });
});

describe("painel de A não alcança dados de B", () => {
  it("configurações: o PUT de A não muda B, e o privado de A não aparece em B", async () => {
    const before = await db
      .select()
      .from(eventSettings)
      .where(eq(eventSettings.eventId, T.eventB.id));
    revalidated.length = 0;
    const put = await admin(T.eventA.id, "/settings", cookieHost, {
      method: "PUT",
      body: json({ values: { "payments.card_fee_percent": 7.5 } }),
    });
    expect(put.status).toBe(200);
    expect(revalidated.every((r) => r.eventId === T.eventA.id)).toBe(true);
    expect(revalidated.length).toBeGreaterThan(0);
    const after = await db
      .select()
      .from(eventSettings)
      .where(eq(eventSettings.eventId, T.eventB.id));
    expect(after).toEqual(before);

    const bView = (await (await admin(T.eventB.id, "/settings", cookieStranger)).json()) as {
      values: Record<string, unknown>;
    };
    expect(bView.values["payments.card_fee_percent"]).not.toBe(7.5);
    const [priv] = await db
      .select()
      .from(eventSettings)
      .where(and(eq(eventSettings.eventId, T.eventB.id), eq(eventSettings.key, "segredo.privado")));
    expect(priv).toBeUndefined();
    // O site público de B também não traz nada de A.
    const site = await app.request(`/api/e/${T.eventB.slug}/site`);
    expect(JSON.stringify(await site.json())).not.toContain("so-do-A");
  });

  it("recado de B: moderar pelo evento A → 404 e nada muda; não aparece na lista de A", async () => {
    const res = await admin(T.eventA.id, `/messages/${msgB}`, cookieHost, {
      method: "PATCH",
      body: json({ approved: false }),
    });
    expect(res.status).toBe(404);
    const [row] = await db.select().from(messages).where(eq(messages.id, msgB));
    expect(row!.approved).toBe(true);
    const list = (await (await admin(T.eventA.id, "/messages", cookieHost)).json()) as {
      messages: { id: number }[];
    };
    expect(list.messages.map((m) => m.id)).not.toContain(msgB);
  });

  it("pedido de B: ver, reembolsar e listar pelo evento A não alcança", async () => {
    const [order] = await db.select().from(giftOrders).where(eq(giftOrders.eventId, T.eventB.id));
    expect(order).toBeDefined();
    const get = await admin(T.eventA.id, `/orders/${order!.publicId}`, cookieHost);
    expect(get.status).toBe(404);
    const refund = await admin(T.eventA.id, `/orders/${order!.publicId}/refund`, cookieHost, {
      method: "POST",
    });
    expect(refund.status).toBe(404);
    const list = (await (await admin(T.eventA.id, "/orders", cookieHost)).json()) as {
      orders: unknown[];
    };
    expect(list.orders).toEqual([]);
    const [still] = await db.select().from(giftOrders).where(eq(giftOrders.id, order!.id));
    expect(still!.status).toBe("paid");
  });
});

describe("lembretes por evento", () => {
  it("a configuração de A não vale para B (e o PUT de A não a muda)", async () => {
    const put = await admin(T.eventA.id, "/reminders", cookieHost, {
      method: "PUT",
      body: json({ enabled: false, daysBefore: [5, 2] }),
    });
    expect(put.status).toBe(200);
    const rows = await db
      .select()
      .from(eventSettings)
      .where(and(eq(eventSettings.eventId, T.eventB.id), eq(eventSettings.key, "reminders")));
    expect(rows).toEqual([]);
    const b = (await (await admin(T.eventB.id, "/reminders", cookieStranger)).json()) as {
      enabled: boolean;
      daysBefore: number[];
    };
    expect(b.daysBefore).not.toEqual([5, 2]);
  });

  it("envio manual em A manda só aos convites de A e grava o log no evento de A", async () => {
    sent.length = 0;
    const res = await admin(T.eventA.id, "/reminders/send", cookieHost, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 1, failed: 0 });
    const mine = sent.filter((m) => m.to.endsWith(`-${T.run}@exemplo.com`));
    expect(mine.map((m) => m.to)).toEqual([`a-${T.run}@exemplo.com`]);
    const logs = await db
      .select()
      .from(rsvpReminders)
      .where(inArray(rsvpReminders.invitationId, [inviteIds.a, inviteIds.b]));
    expect(logs.map((l) => [l.eventId, l.invitationId])).toEqual([[T.eventA.id, inviteIds.a]]);
  });
});
