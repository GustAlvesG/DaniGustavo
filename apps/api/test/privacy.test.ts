import {
  and,
  eq,
  giftOrders,
  gifts,
  guests,
  inArray,
  invitations,
  messages,
  newPublicId,
  payments,
  privacyRequests,
  rsvpLogs,
} from "@casamento/db";
import {
  CONSENT_REQUIRED_MESSAGE,
  PRIVACY_NOTICE_VERSION,
  type AnonymizeResult,
  type ApiError,
  type PrivacyNotice,
  type PrivacyOverview,
  type PrivacyRequestView,
  type PrivacySubjectsResponse,
} from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { MailMessage } from "../src/mailer.ts";
import {
  ANONYMIZED_BUYER_EMAIL,
  ANONYMIZED_BUYER_NAME,
  ANONYMIZED_GUEST_NAME,
} from "../src/privacy/anonymize.ts";
import { createRateLimiter } from "../src/rate-limit.ts";
import {
  createTestEvents,
  setEventSetting,
  TEST_WEB_KEY,
  testApp,
  type TestEvents,
  type TestUserKind,
} from "./helpers.ts";

// Fase 6, frente C: consentimento no RSVP e no mural, pedidos dos titulares, anonimização e
// exportação do evento (docs/saas/fase-6.md §3).

const sent: MailMessage[] = [];
const revalidated: [number, string[]][] = [];
const { app, db } = testApp({
  rateLimiter: createRateLimiter(),
  mailer: {
    send: (m) => {
      sent.push(m);
      return Promise.resolve();
    },
  },
  revalidate: (id, tags) => {
    revalidated.push([id, tags]);
    return Promise.resolve();
  },
});

let t!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
let ipSeq = 0;
const ip = () => `198.51.100.${(ipSeq++ % 250) + 1}`;

const pub = (slug: string, path: string, method = "GET", body?: unknown, clientIp = ip()) =>
  app.request(`/api/e/${slug}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Web-Key": TEST_WEB_KEY,
      "X-Client-Ip": clientIp,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const admin = (kind: TestUserKind, eventId: number, path: string, method = "GET", body?: unknown) =>
  app.request(`/api/admin/events/${eventId}/privacy${path}`, {
    method,
    headers: { cookie: cookies[kind], "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

interface Seeded {
  invitationId: number;
  token: string;
  guestId: number;
  orderId: number;
  orderPublicId: string;
  providerOrderId: string;
  gatewayId: string;
}

/** Convite (com convidado e contato) e pedido pago (com pagamento e recado) no evento. */
async function seed(eventId: number, tag: string): Promise<Seeded> {
  const token = newPublicId();
  const [inv] = await db.insert(invitations).values({
    eventId,
    token,
    label: `Família ${tag}`,
    side: "a",
    maxGuests: 2,
    contactEmail: `contato-${tag}@exemplo.com`,
    contactPhone: "(11) 98888-0000",
  });
  const [g] = await db.insert(guests).values({
    eventId,
    invitationId: inv.insertId,
    name: `Convidado ${tag}`,
    dietaryNotes: "sem glúten",
    email: `convidado-${tag}@exemplo.com`,
  });
  await db
    .insert(rsvpLogs)
    .values({ eventId, invitationId: inv.insertId, payload: { tag }, ip: "203.0.113.9" });
  const [gift] = await db.insert(gifts).values({
    eventId,
    slug: `g-${tag}`,
    title: `Presente ${tag}`,
    priceCents: 12345,
    quotaTotal: 5,
    quotaSold: 1,
    category: "casa",
    tileDesign: "flor",
  });
  const orderPublicId = newPublicId();
  const providerOrderId = `pay_${tag}_${t.run}`;
  const [o] = await db.insert(giftOrders).values({
    publicId: orderPublicId,
    eventId,
    giftId: gift.insertId,
    amountCents: 12345,
    feeCents: 100,
    providerOrderId,
    pixCode: `PIX-COPIA-${tag}`,
    buyerName: `Comprador ${tag}`,
    buyerEmail: `comprador-${tag}@exemplo.com`,
    message: `Felicidades de ${tag}`,
    showOnWall: true,
    status: "paid",
    expiresAt: new Date(),
    paidAt: new Date(),
  });
  const gatewayId = `gw_${tag}_${t.run}`;
  await db.insert(payments).values({
    eventId,
    orderId: o.insertId,
    gatewayId,
    method: "pix",
    grossCents: 12445,
    netCents: 12445,
    raw: { customer: `cus_${tag}`, name: `Comprador ${tag}` },
  });
  await db.insert(messages).values({
    eventId,
    author: `Comprador ${tag}`,
    body: `Felicidades de ${tag}`,
    approved: true,
    giftOrderId: o.insertId,
  });
  return {
    invitationId: inv.insertId,
    token,
    guestId: g.insertId,
    orderId: o.insertId,
    orderPublicId,
    providerOrderId,
    gatewayId,
  };
}

let a!: Seeded;
let b!: Seeded;

beforeAll(async () => {
  t = await createTestEvents(db);
  for (const ev of [t.eventA, t.eventB]) {
    await setEventSetting(db, ev.id, "rsvp.deadline", "2099-12-31T23:59:59-03:00");
  }
  await setEventSetting(db, t.eventA.id, "couple.contact", { email: "noivos@exemplo.com" });
  a = await seed(t.eventA.id, `a${t.run}`);
  b = await seed(t.eventB.id, `b${t.run}`);
  for (const kind of ["host", "owner", "member", "stranger"] as const) {
    cookies[kind] = await t.login(app, kind);
  }
});

afterAll(async () => {
  await t.cleanup();
  await db.$client.end();
});

describe("consentimento no RSVP", () => {
  const rsvp = (token: string, guestId: number, extra: Record<string, unknown> = {}) =>
    pub(t.eventA.slug, `/invitations/${token}/rsvp`, "PUT", {
      guests: [{ id: guestId, attending: true }],
      ...extra,
    });

  it("o convite diz que o aviso é obrigatório e ainda não foi aceito", async () => {
    const res = await pub(t.eventA.slug, `/invitations/${a.token}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { consent: { required: boolean; given: boolean } };
    expect(body.consent).toEqual({ required: true, given: false });
  });

  it("sem o aceite → 422 no campo consent, nada gravado", async () => {
    const res = await rsvp(a.token, a.guestId);
    expect(res.status).toBe(422);
    const err = (await res.json()) as ApiError;
    expect(err.error).toMatchObject({ message: CONSENT_REQUIRED_MESSAGE, field: "consent" });
    const [g] = await db.select().from(guests).where(eq(guests.id, a.guestId));
    expect(g?.rsvpStatus).toBe("pending");
  });

  it("com o aceite grava data e versão; a volta não precisa marcar de novo", async () => {
    expect((await rsvp(a.token, a.guestId, { consent: true })).status).toBe(200);
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, a.invitationId));
    expect(inv?.consentVersion).toBe(PRIVACY_NOTICE_VERSION);
    expect(inv?.consentAt).toBeInstanceOf(Date);
    const again = await rsvp(a.token, a.guestId);
    expect(again.status).toBe(200);
    const body = (await again.json()) as { invitation: { consent: { given: boolean } } };
    expect(body.invitation.consent.given).toBe(true);
  });

  it("evento que não exige o aceite responde sem ele", async () => {
    await setEventSetting(
      db,
      t.eventB.id,
      "privacy.settings",
      { requireConsent: false, contactEmail: null, retentionDays: 365 },
      false,
    );
    const res = await pub(t.eventB.slug, `/invitations/${b.token}/rsvp`, "PUT", {
      guests: [{ id: b.guestId, attending: false }],
    });
    expect(res.status).toBe(200);
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, b.invitationId));
    expect(inv?.consentAt).toBeNull();
  });
});

describe("consentimento no mural", () => {
  it("sem o aceite → 422; com ele, grava a versão", async () => {
    const author = `Tia ${t.run}`;
    const no = await pub(t.eventA.slug, "/messages", "POST", { author, body: "Parabéns!" });
    expect(no.status).toBe(422);
    expect(((await no.json()) as ApiError).error.field).toBe("consent");
    const yes = await pub(t.eventA.slug, "/messages", "POST", {
      author,
      body: "Parabéns!",
      consent: true,
    });
    expect(yes.status).toBe(201);
    const rows = await db
      .select()
      .from(messages)
      .where(and(eq(messages.eventId, t.eventA.id), eq(messages.author, author)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ approved: false, consentVersion: PRIVACY_NOTICE_VERSION });
  });
});

describe("aviso e pedidos do titular (site)", () => {
  it("o aviso público traz versão, exigência e o contato do evento", async () => {
    const res = await pub(t.eventA.slug, "/privacy-requests/notice");
    expect(res.status).toBe(200);
    const notice = (await res.json()) as PrivacyNotice;
    expect(notice).toMatchObject({
      version: PRIVACY_NOTICE_VERSION,
      requireConsent: true,
      contactEmail: "noivos@exemplo.com",
      retentionDays: 365,
    });
  });

  it("grava o pedido, avisa a equipe sem dados da pessoa; honeypot e limite por IP", async () => {
    const before = sent.length;
    const same = `192.0.2.${(Number.parseInt(t.run.slice(-3), 36) % 200) + 1}`;
    const body = {
      kind: "erasure",
      name: `Titular ${t.run}`,
      email: `titular-${t.run}@exemplo.com`,
      message: "Quero apagar meus dados.",
    };
    expect((await pub(t.eventA.slug, "/privacy-requests", "POST", body, same)).status).toBe(202);
    const trap = await pub(
      t.eventA.slug,
      "/privacy-requests",
      "POST",
      { ...body, name: `Robô ${t.run}`, website: "http://spam" },
      same,
    );
    expect(trap.status).toBe(202);
    expect((await pub(t.eventA.slug, "/privacy-requests", "POST", body, same)).status).toBe(202);
    expect((await pub(t.eventA.slug, "/privacy-requests", "POST", body, same)).status).toBe(429);

    const rows = await db
      .select()
      .from(privacyRequests)
      .where(eq(privacyRequests.eventId, t.eventA.id));
    expect(rows.filter((r) => r.name === body.name)).toHaveLength(2);
    expect(rows.some((r) => r.name.startsWith("Robô"))).toBe(false);
    expect(rows[0]?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(before));
    const mail = sent.slice(before).find((m) => m.subject.includes("Pedido de privacidade"));
    expect(mail).toBeDefined();
    expect(mail!.text).not.toContain(body.email);
  });

  it("dados inválidos → 422", async () => {
    const res = await pub(t.eventA.slug, "/privacy-requests", "POST", {
      kind: "x",
      name: "",
      email: "não",
    });
    expect(res.status).toBe(422);
  });
});

describe("painel: privacidade do evento", () => {
  it("quem não é do evento recebe 404; anfitrião sem privacy.read, 403", async () => {
    expect((await admin("stranger", t.eventA.id, "")).status).toBe(404);
    await setEventSetting(
      db,
      t.eventA.id,
      "event.host_permissions",
      { deny: ["privacy.read"] },
      false,
    );
    try {
      expect((await admin("host", t.eventA.id, "")).status).toBe(403);
      expect((await admin("host", t.eventA.id, "/export")).status).toBe(403);
    } finally {
      await setEventSetting(db, t.eventA.id, "event.host_permissions", { deny: [] }, false);
    }
  });

  it("visão geral e configurações (revalida o site)", async () => {
    const res = await admin("host", t.eventA.id, "");
    expect(res.status).toBe(200);
    const view = (await res.json()) as PrivacyOverview;
    expect(view.settings.requireConsent).toBe(true);
    expect(view.openRequests).toBeGreaterThanOrEqual(2);
    expect(view.retentionDueAt).toBe("2031-01-01T15:00:00.000Z");

    const bad = await admin("owner", t.eventA.id, "/settings", "PUT", { retentionDays: 5 });
    expect(bad.status).toBe(422);
    const ok = await admin("owner", t.eventA.id, "/settings", "PUT", {
      requireConsent: true,
      contactEmail: "dados@exemplo.com",
      retentionDays: 400,
    });
    expect(ok.status).toBe(200);
    expect(revalidated).toContainEqual([t.eventA.id, ["site"]]);
    const notice = (await (
      await pub(t.eventA.slug, "/privacy-requests/notice")
    ).json()) as PrivacyNotice;
    expect(notice.contactEmail).toBe("dados@exemplo.com");
  });

  it("lista e resolve pedido; resposta vai por e-mail ao titular; outro evento → 404", async () => {
    const list = (await (await admin("member", t.eventA.id, "/requests?status=open")).json()) as {
      requests: PrivacyRequestView[];
    };
    const req = list.requests.find((r) => r.name === `Titular ${t.run}`)!;
    expect(req).toBeDefined();
    expect(
      (
        await admin("stranger", t.eventB.id, `/requests/${req.id}`, "PATCH", {
          status: "done",
        })
      ).status,
    ).toBe(404);
    const before = sent.length;
    const res = await admin("member", t.eventA.id, `/requests/${req.id}`, "PATCH", {
      status: "done",
      response: "Dados apagados.",
    });
    expect(res.status).toBe(200);
    const { request } = (await res.json()) as { request: PrivacyRequestView };
    expect(request).toMatchObject({ status: "done", response: "Dados apagados." });
    await vi.waitFor(() =>
      expect(sent.slice(before).some((m) => m.to === `titular-${t.run}@exemplo.com`)).toBe(true),
    );
  });

  it("busca o titular só no evento", async () => {
    const res = await admin("owner", t.eventA.id, `/subjects?q=${encodeURIComponent(`a${t.run}`)}`);
    const found = (await res.json()) as PrivacySubjectsResponse;
    expect(found.invitations.map((i) => i.id)).toEqual([a.invitationId]);
    expect(found.orders.map((o) => o.id)).toEqual([a.orderId]);
    const other = (await (
      await admin("owner", t.eventA.id, `/subjects?q=${encodeURIComponent(`b${t.run}`)}`)
    ).json()) as PrivacySubjectsResponse;
    expect(other).toEqual({ invitations: [], orders: [] });
  });
});

describe("exportação", () => {
  it("o evento inteiro, sem dados de outro evento nem segredos/ids do provedor", async () => {
    const res = await admin("owner", t.eventA.id, "/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const text = await res.text();
    expect(text).toContain(`Família a${t.run}`);
    expect(text).toContain(`comprador-a${t.run}@exemplo.com`);
    for (const secret of [
      a.token,
      a.providerOrderId,
      a.gatewayId,
      `PIX-COPIA-a${t.run}`,
      `cus_a${t.run}`,
      "203.0.113.9",
      // Nada do evento B.
      `b${t.run}`,
      b.token,
    ]) {
      expect(text, secret).not.toContain(secret);
    }
    const data = JSON.parse(text) as { scope: string; privacyRequests: unknown[] };
    expect(data.scope).toBe("event");
    expect(data.privacyRequests.length).toBeGreaterThan(0);
  });

  it("só o titular escolhido; id de outro evento não vaza; CSV", async () => {
    const res = await admin(
      "owner",
      t.eventA.id,
      `/export?invitationIds=${a.invitationId},${b.invitationId}&orderIds=${b.orderId}`,
    );
    const data = (await res.json()) as {
      scope: string;
      invitations: { id: number }[];
      orders: unknown[];
      privacyRequests: unknown[];
    };
    expect(data.scope).toBe("subject");
    expect(data.invitations.map((i) => i.id)).toEqual([a.invitationId]);
    expect(data.orders).toEqual([]);
    expect(data.privacyRequests).toEqual([]);

    const csv = await admin("owner", t.eventA.id, `/export?format=csv&orderIds=${a.orderId}`);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const body = await csv.text();
    expect(body).toContain(`Comprador a${t.run}`);
    expect(body).toContain("124,45");
  });
});

describe("anonimização", () => {
  it("troca os dados pessoais e mantém valores; ids de outro evento são ignorados", async () => {
    const [before] = await db.select().from(giftOrders).where(eq(giftOrders.id, a.orderId));
    const res = await admin("owner", t.eventA.id, "/anonymize", "POST", {
      invitationIds: [a.invitationId, b.invitationId],
      orderIds: [a.orderId, b.orderId],
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as AnonymizeResult).toEqual({ invitations: 1, orders: 1 });
    expect(revalidated).toContainEqual([t.eventA.id, ["messages"]]);

    const [inv] = await db.select().from(invitations).where(eq(invitations.id, a.invitationId));
    expect(inv).toMatchObject({ contactEmail: null, contactPhone: null });
    expect(inv?.anonymizedAt).toBeInstanceOf(Date);
    expect(inv?.label).not.toContain(t.run);
    const [g] = await db.select().from(guests).where(eq(guests.id, a.guestId));
    expect(g).toMatchObject({ name: ANONYMIZED_GUEST_NAME, email: null, dietaryNotes: null });
    expect(
      await db.select().from(rsvpLogs).where(eq(rsvpLogs.invitationId, a.invitationId)),
    ).toEqual([]);

    const [o] = await db.select().from(giftOrders).where(eq(giftOrders.id, a.orderId));
    expect(o).toMatchObject({
      buyerName: ANONYMIZED_BUYER_NAME,
      buyerEmail: ANONYMIZED_BUYER_EMAIL,
      message: null,
      pixCode: null,
      amountCents: before!.amountCents,
      feeCents: before!.feeCents,
      status: "paid",
    });
    expect(await db.select().from(messages).where(eq(messages.giftOrderId, a.orderId))).toEqual([]);
    const [p] = await db.select().from(payments).where(eq(payments.orderId, a.orderId));
    expect(p).toMatchObject({ grossCents: 12445, raw: null });

    // O evento B continua intacto.
    const [ob] = await db.select().from(giftOrders).where(eq(giftOrders.id, b.orderId));
    expect(ob?.buyerName).toBe(`Comprador b${t.run}`);
    const [ib] = await db
      .select()
      .from(invitations)
      .where(inArray(invitations.id, [b.invitationId]));
    expect(ib?.anonymizedAt).toBeNull();
  });

  it("lista vazia → 422", async () => {
    const res = await admin("owner", t.eventA.id, "/anonymize", "POST", {
      invitationIds: [],
      orderIds: [],
    });
    expect(res.status).toBe(422);
  });
});
