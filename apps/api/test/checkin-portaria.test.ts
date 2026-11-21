import { checkinLinks, eq, guests, invitations, newPublicId } from "@casamento/db";
import {
  CHECKIN_PIN_MAX_FAILURES,
  type CheckinArrivalResult,
  type CheckinLinkCreated,
  type CheckinLookupResult,
  type CheckinSessionResult,
  type CheckinTotals,
} from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invitationRef } from "../src/checkin/crypto.ts";
import { CHECKIN_DENIED, CHECKIN_SESSION_IP_LIMIT } from "../src/routes/checkin.ts";
import { createTestEvents, testApp, type TestEvents } from "./helpers.ts";

// Fase 7, frente A: portaria sem conta (/api/checkin/*): link + PIN → sessão (Bearer).

const { app, db, env } = testApp();
let t!: TestEvents;
let owner = "";
let stranger = "";

let ipSeq = 0;
/** IP novo por chamada: o limite por IP tem teste próprio. */
const nextIp = () => `198.51.100.${(ipSeq++ % 250) + 1}`;

const SENSITIVE = ["11 98888-7777", "ana@exemplo.com", "contato@exemplo.com", "camarão"];

async function seedInvitation(eventId: number, label: string, names: string[]) {
  const token = newPublicId();
  const [res] = await db.insert(invitations).values({
    eventId,
    token,
    label,
    side: "noiva",
    maxGuests: names.length,
    contactEmail: "contato@exemplo.com",
    accessNote: "Só cerimônia",
  });
  for (const name of names) {
    await db.insert(guests).values({
      eventId,
      invitationId: res.insertId,
      name,
      rsvpStatus: "confirmed",
      phone: "11 98888-7777",
      email: "ana@exemplo.com",
      dietaryNotes: "Alergia a camarão",
    });
  }
  return { id: res.insertId, token };
}

async function newLink(eventId: number, label = "Portaria principal", cookie = owner) {
  const res = await app.request(`/api/admin/events/${eventId}/checkin/links`, {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as CheckinLinkCreated;
  return { ...body, token: body.url.split("#")[1]! };
}

const openSession = (token: string, pin: string, ip = nextIp()) =>
  app.request("/api/checkin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Real-IP": ip },
    body: JSON.stringify({ token, pin }),
  });

async function sessionOf(link: { token: string; pin: string }) {
  const res = await openSession(link.token, link.pin);
  expect(res.status).toBe(200);
  return ((await res.json()) as CheckinSessionResult).session;
}

const call = (session: string, path: string, body?: unknown) =>
  app.request(`/api/checkin${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${session}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const wrongPin = (pin: string) => String((Number(pin) + 1) % 1_000_000).padStart(6, "0");

async function expectDenied(res: Response) {
  expect(res.status).toBe(401);
  expect(((await res.json()) as { error: { message: string } }).error.message).toBe(CHECKIN_DENIED);
}

let convA!: { id: number; token: string };
let convB!: { id: number; token: string };

beforeAll(async () => {
  t = await createTestEvents(db);
  owner = await t.login(app, "owner");
  stranger = await t.login(app, "stranger");
  convA = await seedInvitation(t.eventA.id, "Família Portela", ["Ana Portela", "Rui Portela"]);
  convB = await seedInvitation(t.eventB.id, "Família Bezerra", ["Bia Bezerra"]);
});

afterAll(async () => {
  await t.cleanup();
  await db.$client.end();
});

describe("entrada com link + PIN", () => {
  it("PIN certo abre a sessão com o nome do evento", async () => {
    const link = await newLink(t.eventA.id);
    const res = await openSession(link.token, link.pin);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as CheckinSessionResult;
    expect(body.event.name).toBe(t.eventA.name);
    expect(body.linkLabel).toBe("Portaria principal");
    expect(Date.parse(body.expiresAt)).toBeLessThanOrEqual(Date.parse(link.link.expiresAt));
    const [row] = await db.select().from(checkinLinks).where(eq(checkinLinks.id, link.link.id));
    expect(row!.lastUsedAt).not.toBeNull();
  });

  it("PIN errado, token inexistente, revogado e expirado dão o mesmo 401", async () => {
    const link = await newLink(t.eventA.id);
    await expectDenied(await openSession(link.token, wrongPin(link.pin)));
    await expectDenied(await openSession("A".repeat(43), link.pin));
    await expectDenied(await openSession("lixo-curto-demais-mas-16", link.pin));

    const revoked = await newLink(t.eventA.id, "Revogado");
    await app.request(`/api/admin/events/${t.eventA.id}/checkin/links/${revoked.link.id}/revoke`, {
      method: "POST",
      headers: { cookie: owner },
    });
    await expectDenied(await openSession(revoked.token, revoked.pin));

    const expired = await newLink(t.eventA.id, "Vencido");
    await db
      .update(checkinLinks)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(checkinLinks.id, expired.link.id));
    await expectDenied(await openSession(expired.token, expired.pin));
  });

  it("PIN em formato errado é 422 (não gasta tentativa)", async () => {
    const link = await newLink(t.eventA.id);
    expect((await openSession(link.token, "12a")).status).toBe(422);
    const [row] = await db.select().from(checkinLinks).where(eq(checkinLinks.id, link.link.id));
    expect(row!.pinFailures).toBe(0);
  });

  it(`bloqueia o link depois de ${CHECKIN_PIN_MAX_FAILURES} PINs errados (até com o certo)`, async () => {
    const link = await newLink(t.eventA.id, "Bloqueável");
    for (let i = 0; i < CHECKIN_PIN_MAX_FAILURES; i++) {
      await expectDenied(await openSession(link.token, wrongPin(link.pin)));
    }
    await expectDenied(await openSession(link.token, link.pin));
    const overview = (await (
      await app.request(`/api/admin/events/${t.eventA.id}/checkin`, { headers: { cookie: owner } })
    ).json()) as { links: { id: number; lockedUntil: string | null }[] };
    expect(overview.links.find((l) => l.id === link.link.id)!.lockedUntil).not.toBeNull();
    // Passado o bloqueio, o PIN certo volta a valer.
    await db
      .update(checkinLinks)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(checkinLinks.id, link.link.id));
    expect((await openSession(link.token, link.pin)).status).toBe(200);
  });

  it("limita tentativas por IP", async () => {
    const link = await newLink(t.eventA.id, "Por IP");
    const ip = "192.0.2.77";
    for (let i = 0; i < CHECKIN_SESSION_IP_LIMIT; i++) {
      expect((await openSession("B".repeat(43), "000000", ip)).status).toBe(401);
    }
    const blocked = await openSession(link.token, link.pin, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });
});

describe("sessão", () => {
  it("sem sessão, sessão adulterada ou cookie do painel → 401", async () => {
    expect((await app.request("/api/checkin/summary")).status).toBe(401);
    expect((await app.request("/api/checkin/summary", { headers: { cookie: owner } })).status).toBe(
      401,
    );
    const session = await sessionOf(await newLink(t.eventA.id));
    const [, linkId, exp, sig] = session.split(".");
    // Mesmo link e assinatura, outro evento: a assinatura não confere.
    expect((await call(`${t.eventB.id}.${linkId}.${exp}.${sig}`, "/summary")).status).toBe(401);
    // Prazo esticado.
    expect(
      (await call(`${t.eventA.id}.${linkId}.${Number(exp) + 1}.${sig}`, "/summary")).status,
    ).toBe(401);
    expect((await call(session, "/summary")).status).toBe(200);
  });

  it("revogar derruba a sessão na hora", async () => {
    const link = await newLink(t.eventA.id, "Revogar depois");
    const session = await sessionOf(link);
    expect((await call(session, "/summary")).status).toBe(200);
    await app.request(`/api/admin/events/${t.eventA.id}/checkin/links/${link.link.id}/revoke`, {
      method: "POST",
      headers: { cookie: owner },
    });
    expect((await call(session, "/summary")).status).toBe(401);
    expect((await call(session, "/lookup?q=Portela")).status).toBe(401);
  });

  it("link vencido derruba a sessão", async () => {
    const link = await newLink(t.eventA.id, "Vence depois");
    const session = await sessionOf(link);
    await db
      .update(checkinLinks)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(checkinLinks.id, link.link.id));
    expect((await call(session, "/summary")).status).toBe(401);
  });
});

describe("portaria em ação", () => {
  it("busca sem dados sensíveis, chegada parcial e desfazer", async () => {
    const session = await sessionOf(await newLink(t.eventA.id, "Portão 1"));
    const before = (await (await call(session, "/summary")).json()) as CheckinTotals;

    const byCode = await call(
      session,
      `/lookup?code=${encodeURIComponent(`https://site/c/${convA.token}`)}`,
    );
    expect(byCode.status).toBe(200);
    const text = await byCode.text();
    for (const s of SENSITIVE) expect(text).not.toContain(s);
    expect(text).not.toContain(convA.token);
    const inv = (JSON.parse(text) as CheckinLookupResult).invitations[0]!;
    expect(inv).toMatchObject({
      label: "Família Portela",
      confirmed: 2,
      accessNote: "Só cerimônia",
    });

    const byName = (await (await call(session, "/lookup?q=portela")).json()) as CheckinLookupResult;
    expect(byName.invitations.map((i) => i.ref)).toEqual([inv.ref]);

    const partial = await call(session, "/arrivals", { ref: inv.ref, people: 1 });
    expect(partial.status).toBe(201);
    const r1 = (await partial.json()) as CheckinArrivalResult;
    expect(r1.invitation.arrived).toBe(1);
    expect(r1.invitation.arrivals[0]!.by).toBe("Portão 1");
    expect(r1.totals.arrivedPeople).toBe(before.arrivedPeople + 1);

    const rest = (await (
      await call(session, "/arrivals", { ref: inv.ref, people: 1 })
    ).json()) as CheckinArrivalResult;
    expect(rest.invitation.arrived).toBe(2);

    const undo = await call(session, `/arrivals/${rest.invitation.arrivals[0]!.id}/undo`, {});
    expect(undo.status).toBe(200);
    const r3 = (await undo.json()) as CheckinArrivalResult;
    expect(r3.invitation.arrived).toBe(1);
    expect(r3.totals.arrivedPeople).toBe(before.arrivedPeople + 1);
    for (const s of SENSITIVE) expect(JSON.stringify(r3)).not.toContain(s);
  });

  it("link de um evento não enxerga nem marca convite de outro", async () => {
    const sessionB = await sessionOf(await newLink(t.eventB.id, "Portaria B", stranger));
    expect((await call(sessionB, `/lookup?code=${convA.token}`)).status).toBe(404);
    const byName = (await (
      await call(sessionB, "/lookup?q=Portela")
    ).json()) as CheckinLookupResult;
    expect(byName.invitations).toHaveLength(0);
    const refA = invitationRef(env.BETTER_AUTH_SECRET, t.eventA.id, convA.id);
    expect((await call(sessionB, "/arrivals", { ref: refA, people: 1 })).status).toBe(404);

    // Chegada marcada no A não pode ser desfeita pela portaria do B.
    const sessionA = await sessionOf(await newLink(t.eventA.id, "Portaria A"));
    const a = (await (
      await call(sessionA, "/arrivals", { ref: refA, people: 1 })
    ).json()) as CheckinArrivalResult;
    const id = a.invitation.arrivals[0]!.id;
    expect((await call(sessionB, `/arrivals/${id}/undo`, {})).status).toBe(404);

    const own = (await (
      await call(sessionB, `/lookup?code=${convB.token}`)
    ).json()) as CheckinLookupResult;
    expect(own.invitations[0]!.label).toBe("Família Bezerra");
  });
});
