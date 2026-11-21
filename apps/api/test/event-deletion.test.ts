import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  eq,
  eventDeletions,
  eventDomains,
  eventMedia,
  eventSettings,
  events,
  giftOrders,
  gifts,
  guests,
  invitations,
  messages,
  newPublicId,
  payments,
  privacyRequests,
} from "@casamento/db";
import {
  EVENT_DELETION_ORDER_WINDOW_DAYS,
  type ApiError,
  type EventDeletionPreview,
} from "@casamento/shared";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalStorage } from "../src/storage/index.ts";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";

// Fase 6, frente C: apagar evento arquivado (docs/saas/fase-6.md §3).

const uploadDir = await mkdtemp(join(tmpdir(), "casamento-apagar-"));
const revalidated: [number, string[]][] = [];
const { app, db } = testApp(
  {
    revalidate: (id, tags) => {
      revalidated.push([id, tags]);
      return Promise.resolve();
    },
  },
  { UPLOAD_DIR: uploadDir },
);
const storage = createLocalStorage(uploadDir);

let t!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
const DAY = 24 * 60 * 60_000;

const url = (eventId: number, path = "") =>
  `/api/admin/orgs/${t.orgA.id}/events/${eventId}/deletion${path}`;
const run = (kind: TestUserKind, path: string, method = "GET", body?: unknown) =>
  app.request(path, {
    method,
    headers: { cookie: cookies[kind], "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const preview = async (eventId: number) =>
  (await (await run("owner", url(eventId))).json()) as EventDeletionPreview;
const confirm = (eventId: number, slug: string, kind: TestUserKind = "owner") =>
  run(kind, url(eventId), "POST", { confirmSlug: slug });

async function setStatus(eventId: number, status: "active" | "archived") {
  const res = await run("owner", `/api/admin/orgs/${t.orgA.id}/events/${eventId}`, "PATCH", {
    status,
  });
  expect(res.status).toBe(200);
}

let giftId = 0;
let orderId = 0;
const buyerEmail = `comprador-apagar@exemplo.com`;

beforeAll(async () => {
  t = await createTestEvents(db);
  for (const kind of ["host", "owner", "member", "stranger"] as const) {
    cookies[kind] = await t.login(app, kind);
  }
  const ev = t.eventA.id;
  const [inv] = await db.insert(invitations).values({
    eventId: ev,
    token: newPublicId(),
    label: "Família Apagar",
    side: "a",
    contactEmail: "familia-apagar@exemplo.com",
  });
  await db
    .insert(guests)
    .values({ eventId: ev, invitationId: inv.insertId, name: "Fulana Apagar" });
  const [g] = await db.insert(gifts).values({
    eventId: ev,
    slug: "g-apagar",
    title: "Panela",
    priceCents: 10000,
    category: "casa",
    tileDesign: "flor",
  });
  giftId = g.insertId;
  const [o] = await db.insert(giftOrders).values({
    publicId: newPublicId(),
    eventId: ev,
    giftId,
    amountCents: 10000,
    feeCents: 500,
    platformFeeCents: 50,
    buyerName: "Comprador Apagar",
    buyerEmail,
    status: "pending",
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  orderId = o.insertId;
  await db.insert(payments).values({
    eventId: ev,
    orderId,
    gatewayId: `gw-apagar-${t.run}`,
    method: "pix",
    grossCents: 10500,
    netCents: 10500,
  });
  await db
    .insert(messages)
    .values({ eventId: ev, author: "Comprador Apagar", body: "Oi", giftOrderId: orderId });
  await db
    .insert(privacyRequests)
    .values({ eventId: ev, kind: "access", name: "Titular", email: "titular-apagar@exemplo.com" });
  const photo = `${ulid()}.jpg`;
  await db.insert(eventMedia).values({
    eventId: ev,
    file: photo,
    mime: "image/jpeg",
    bytes: 3,
    width: 1,
    height: 1,
  });
  await storage.put(ev, photo, new Uint8Array([1, 2, 3]));
  await storage.putPrivate(ev, `${ulid()}.pdf`, new Uint8Array([4, 5, 6]));
});

afterAll(async () => {
  await t.cleanup();
  await db.$client.end();
  await rm(uploadDir, { recursive: true, force: true });
});

describe("permissões", () => {
  it("membro da organização → 403; anfitrião e outra organização → 404", async () => {
    expect((await run("member", url(t.eventA.id))).status).toBe(403);
    expect((await confirm(t.eventA.id, t.eventA.slug, "member")).status).toBe(403);
    expect((await run("host", url(t.eventA.id))).status).toBe(404);
    expect((await run("stranger", url(t.eventA.id))).status).toBe(404);
    // Evento de outra organização pelo caminho da org A.
    expect((await run("owner", url(t.eventB.id))).status).toBe(404);
  });
});

describe("bloqueios", () => {
  it("evento não arquivado → 409", async () => {
    const p = await preview(t.eventA.id);
    expect(p.blockers.map((b) => b.code)).toContain("not_archived");
    expect(p.counts).toMatchObject({ invitations: 1, guests: 1, orders: 1, messages: 1, media: 1 });
    const res = await confirm(t.eventA.id, t.eventA.slug);
    expect(res.status).toBe(409);
  });

  it("pedido pendente → 409", async () => {
    await setStatus(t.eventA.id, "archived");
    const p = await preview(t.eventA.id);
    expect(p.blockers.map((b) => b.code)).toEqual(["pending_orders"]);
    expect((await confirm(t.eventA.id, t.eventA.slug)).status).toBe(409);
  });

  it("pedido pago há menos de 180 dias → 409 com a data em que libera", async () => {
    const paidAt = new Date(Date.now() - 10 * DAY);
    await db
      .update(giftOrders)
      .set({ status: "paid", paidAt, updatedAt: paidAt })
      .where(eq(giftOrders.id, orderId));
    const p = await preview(t.eventA.id);
    expect(p.blockers.map((b) => b.code)).toEqual(["recent_orders"]);
    expect(p.deletableFrom).toBe(
      new Date(paidAt.getTime() + EVENT_DELETION_ORDER_WINDOW_DAYS * DAY).toISOString(),
    );
    const res = await confirm(t.eventA.id, t.eventA.slug);
    expect(res.status).toBe(409);
    expect(((await res.json()) as ApiError).error.message).toContain("180 dias");
  });

  it("reembolso recente também bloqueia", async () => {
    const old = new Date(Date.now() - 400 * DAY);
    const recent = new Date(Date.now() - 20 * DAY);
    await db
      .update(giftOrders)
      .set({ status: "refunded", paidAt: old, updatedAt: recent })
      .where(eq(giftOrders.id, orderId));
    expect((await preview(t.eventA.id)).blockers.map((b) => b.code)).toEqual(["recent_orders"]);
  });
});

describe("apagar", () => {
  it("slug errado → 422 no campo", async () => {
    const old = new Date(Date.now() - 200 * DAY);
    await db
      .update(giftOrders)
      .set({ status: "paid", paidAt: old, updatedAt: old })
      .where(eq(giftOrders.id, orderId));
    expect((await preview(t.eventA.id)).blockers).toEqual([]);
    const res = await confirm(t.eventA.id, "outro-slug");
    expect(res.status).toBe(422);
    expect(((await res.json()) as ApiError).error.field).toBe("confirmSlug");
  });

  it("exporta antes de apagar (só o dono)", async () => {
    expect((await run("member", url(t.eventA.id, "/export"))).status).toBe(403);
    const res = await run("owner", url(t.eventA.id, "/export"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Família Apagar");
  });

  it("apaga linhas e arquivos (inclusive privados) e guarda só o resumo", async () => {
    const ev = t.eventA.id;
    expect(await readdir(join(uploadDir, String(ev), "private"))).toHaveLength(1);
    const res = await confirm(ev, t.eventA.slug);
    expect(res.status).toBe(200);

    expect(await db.select().from(events).where(eq(events.id, ev))).toEqual([]);
    for (const [name, rows] of [
      ["invitations", await db.select().from(invitations).where(eq(invitations.eventId, ev))],
      ["guests", await db.select().from(guests).where(eq(guests.eventId, ev))],
      ["gift_orders", await db.select().from(giftOrders).where(eq(giftOrders.eventId, ev))],
      ["payments", await db.select().from(payments).where(eq(payments.eventId, ev))],
      ["gifts", await db.select().from(gifts).where(eq(gifts.eventId, ev))],
      ["messages", await db.select().from(messages).where(eq(messages.eventId, ev))],
      ["event_media", await db.select().from(eventMedia).where(eq(eventMedia.eventId, ev))],
      [
        "privacy_requests",
        await db.select().from(privacyRequests).where(eq(privacyRequests.eventId, ev)),
      ],
      [
        "event_settings",
        await db.select().from(eventSettings).where(eq(eventSettings.eventId, ev)),
      ],
      ["event_domains", await db.select().from(eventDomains).where(eq(eventDomains.eventId, ev))],
    ] as const) {
      expect(rows, name).toEqual([]);
    }
    await expect(readdir(join(uploadDir, String(ev)))).rejects.toThrow();

    const summary = await db
      .select()
      .from(eventDeletions)
      .where(eq(eventDeletions.formerEventId, ev));
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({
      organizationId: t.orgA.id,
      slug: t.eventA.slug,
      name: t.eventA.name,
      ordersCount: 1,
      paidTotalCents: 10500,
      platformFeeCents: 50,
      deletedBy: t.users.owner.id,
    });
    const text = JSON.stringify(summary[0]);
    for (const personal of [buyerEmail, "Comprador Apagar", "Fulana Apagar", "familia-apagar"]) {
      expect(text).not.toContain(personal);
    }
    expect(revalidated).toContainEqual([ev, ["site", "gifts", "messages"]]);
    // O evento não existe mais: a rota responde 404.
    expect((await run("owner", url(ev))).status).toBe(404);
  });

  it("o evento B (outra organização) continua inteiro", async () => {
    expect(await db.select().from(events).where(eq(events.id, t.eventB.id))).toHaveLength(1);
  });
});
