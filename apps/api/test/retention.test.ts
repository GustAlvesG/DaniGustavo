import {
  eq,
  events,
  giftOrders,
  gifts,
  guests,
  invitations,
  messages,
  newPublicId,
} from "@casamento/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ANONYMIZED_BUYER_NAME,
  ANONYMIZED_GUEST_NAME,
  ANONYMIZED_INVITATION_LABEL,
} from "../src/privacy/anonymize.ts";
import { runRetention } from "../src/privacy/retention.ts";
import { createTestEvents, setEventSetting, testDb, type TestEvents } from "./helpers.ts";

// Fase 6, frente C: rotina de retenção (relógio fixo; só os eventos deste arquivo).

const db = testDb();
let t!: TestEvents;
const NOW = new Date("2026-11-21T12:00:00Z");

async function seed(eventId: number, tag: string) {
  const [inv] = await db.insert(invitations).values({
    eventId,
    token: newPublicId(),
    label: `Família ${tag}`,
    side: "a",
    contactEmail: `${tag}@exemplo.com`,
  });
  await db.insert(guests).values({ eventId, invitationId: inv.insertId, name: `Pessoa ${tag}` });
  const [g] = await db.insert(gifts).values({
    eventId,
    slug: `g-${tag}`,
    title: "Jogo de copos",
    priceCents: 5000,
    category: "casa",
    tileDesign: "flor",
  });
  const [o] = await db.insert(giftOrders).values({
    publicId: newPublicId(),
    eventId,
    giftId: g.insertId,
    amountCents: 5000,
    buyerName: `Comprador ${tag}`,
    buyerEmail: `c-${tag}@exemplo.com`,
    status: "paid",
    expiresAt: NOW,
    paidAt: new Date("2024-01-01T12:00:00Z"),
  });
  await db.insert(messages).values([
    { eventId, author: `Aprovado ${tag}`, body: "Lindo!", approved: true },
    { eventId, author: `Pendente ${tag}`, body: "Oi", approved: false },
  ]);
  return { invitationId: inv.insertId, orderId: o.insertId };
}

let a!: Awaited<ReturnType<typeof seed>>;
let b!: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  t = await createTestEvents(db);
  // A: evento há quase 2 anos (prazo padrão de 365 dias vencido).
  // B: mesmo passado, mas o evento desligou a retenção automática.
  // Rascunho: evento em 2030 (prazo no futuro).
  const past = new Date("2025-01-10T18:00:00Z");
  for (const id of [t.eventA.id, t.eventB.id]) {
    await db.update(events).set({ startsAt: past }).where(eq(events.id, id));
  }
  await setEventSetting(
    db,
    t.eventB.id,
    "privacy.settings",
    { requireConsent: true, contactEmail: null, retentionDays: null },
    false,
  );
  a = await seed(t.eventA.id, `ret-a-${t.run}`);
  b = await seed(t.eventB.id, `ret-b-${t.run}`);
  await seed(t.draftA.id, `ret-d-${t.run}`);
});

afterAll(async () => {
  await t.cleanup();
  await db.$client.end();
});

const ids = () => [t.eventA.id, t.eventB.id, t.draftA.id];

describe("runRetention", () => {
  it("antes do prazo não mexe em nada", async () => {
    const r = await runRetention(
      { db, now: () => new Date("2025-06-01T00:00:00Z") },
      {
        eventIds: ids(),
      },
    );
    expect(r.events).toEqual([]);
  });

  it("depois do prazo anonimiza só o evento vencido e marca a data", async () => {
    const r = await runRetention({ db, now: () => NOW }, { eventIds: ids() });
    expect(r.events).toEqual([t.eventA.id]);
    expect(r).toMatchObject({ invitations: 1, orders: 1, messages: 1 });

    const [ev] = await db.select().from(events).where(eq(events.id, t.eventA.id));
    expect(ev?.personalDataPurgedAt?.toISOString()).toBe(NOW.toISOString());
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, a.invitationId));
    expect(inv).toMatchObject({ label: ANONYMIZED_INVITATION_LABEL, contactEmail: null });
    const gs = await db.select().from(guests).where(eq(guests.invitationId, a.invitationId));
    expect(gs.map((g) => g.name)).toEqual([ANONYMIZED_GUEST_NAME]);
    const [o] = await db.select().from(giftOrders).where(eq(giftOrders.id, a.orderId));
    expect(o).toMatchObject({ buyerName: ANONYMIZED_BUYER_NAME, amountCents: 5000 });
    const msgs = await db.select().from(messages).where(eq(messages.eventId, t.eventA.id));
    expect(msgs.map((m) => m.approved)).toEqual([true]);

    // B (retenção desligada) e o rascunho (prazo no futuro) ficam como estavam.
    const [ob] = await db.select().from(giftOrders).where(eq(giftOrders.id, b.orderId));
    expect(ob?.buyerName).toBe(`Comprador ret-b-${t.run}`);
    const [evB] = await db.select().from(events).where(eq(events.id, t.eventB.id));
    expect(evB?.personalDataPurgedAt).toBeNull();
  });

  it("rodar de novo não repete", async () => {
    const r = await runRetention({ db, now: () => NOW }, { eventIds: ids() });
    expect(r.events).toEqual([]);
  });
});
