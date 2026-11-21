import {
  checkinLinks,
  checkins,
  eq,
  guests,
  invitations,
  newPublicId,
  seatAssignments,
  seatingTables,
} from "@casamento/db";
import type {
  CheckinArrivalResult,
  CheckinLinkCreated,
  CheckinLookupResult,
  CheckinOverview,
} from "@casamento/shared";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invitationRef } from "../src/checkin/crypto.ts";
import { createTestEvents, setEventSetting, testApp, type TestEvents } from "./helpers.ts";

// Fase 7, frente A: check-in pelo painel (/api/admin/events/:eventId/checkin).

const { app, db, env } = testApp();
let t!: TestEvents;
let owner = "";
let host = "";
let stranger = "";

const url = (eventId: number, path = "") => `/api/admin/events/${eventId}/checkin${path}`;
const get = (eventId: number, path: string, cookie = owner) =>
  app.request(url(eventId, path), { headers: { cookie } });
const post = (eventId: number, path: string, body: unknown = {}, cookie = owner) =>
  app.request(url(eventId, path), {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/** Dados que a portaria/check-in nunca pode devolver. */
export const SENSITIVE = [
  "11 98888-7777",
  "ana@exemplo.com",
  "contato@exemplo.com",
  "21 97777-6666",
  "camarão",
];

export async function seedInvitation(
  eventId: number,
  label: string,
  people: { name: string; status: "confirmed" | "declined" | "pending"; child?: boolean }[],
  accessNote: string | null = null,
) {
  const token = newPublicId();
  const [res] = await db.insert(invitations).values({
    eventId,
    token,
    label,
    side: "noiva",
    maxGuests: people.length,
    contactEmail: "contato@exemplo.com",
    contactPhone: "21 97777-6666",
    accessNote,
  });
  const ids: number[] = [];
  for (const p of people) {
    const [g] = await db.insert(guests).values({
      eventId,
      invitationId: res.insertId,
      name: p.name,
      isChild: p.child ?? false,
      rsvpStatus: p.status,
      phone: "11 98888-7777",
      email: "ana@exemplo.com",
      dietaryNotes: "Alergia a camarão",
    });
    ids.push(g.insertId);
  }
  return { id: res.insertId, token, guestIds: ids };
}

let silva!: Awaited<ReturnType<typeof seedInvitation>>;
let outro!: Awaited<ReturnType<typeof seedInvitation>>;

beforeAll(async () => {
  t = await createTestEvents(db);
  owner = await t.login(app, "owner");
  host = await t.login(app, "host");
  stranger = await t.login(app, "stranger");
  silva = await seedInvitation(
    t.eventA.id,
    "Família Silvanópolis",
    [
      { name: "Ana Silvanópolis", status: "confirmed" },
      { name: "Bruno Silvanópolis", status: "confirmed", child: true },
      { name: "Carla Silvanópolis", status: "declined" },
    ],
    "Só cerimônia",
  );
  outro = await seedInvitation(t.eventB.id, "Família Outrora", [
    { name: "Davi Outrora", status: "confirmed" },
  ]);
  const [table] = await db
    .insert(seatingTables)
    .values({ eventId: t.eventA.id, name: "Mesa 3", seats: 8 });
  await db
    .insert(seatAssignments)
    .values({ eventId: t.eventA.id, tableId: table.insertId, guestId: silva.guestIds[0]! });
});

afterAll(async () => {
  await t.cleanup();
  await db.$client.end();
});

describe("links da portaria", () => {
  it("gera link com PIN mostrado uma vez e guarda só os hashes", async () => {
    const res = await post(t.eventA.id, "/links", { label: "Portaria principal" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as CheckinLinkCreated;
    expect(body.pin).toMatch(/^\d{6}$/);
    expect(body.url).toMatch(/\/portaria\/#[A-Za-z0-9_-]{43}$/);
    expect(body.link).toMatchObject({ label: "Portaria principal", status: "active" });
    // Validade padrão de 48 h.
    const hours = (Date.parse(body.link.expiresAt) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(47);
    expect(hours).toBeLessThanOrEqual(48);

    const token = body.url.split("#")[1]!;
    const [row] = await db.select().from(checkinLinks).where(eq(checkinLinks.id, body.link.id));
    expect(row!.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(row!.pinHash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row!.pinHash).not.toContain(body.pin);

    const overview = (await (await get(t.eventA.id, "")).json()) as CheckinOverview;
    const listed = overview.links.find((l) => l.id === body.link.id)!;
    expect(JSON.stringify(listed)).not.toContain(token);
    expect(listed).not.toHaveProperty("pin");
  });

  it("valida nome e validade", async () => {
    expect((await post(t.eventA.id, "/links", { label: "" })).status).toBe(422);
    expect((await post(t.eventA.id, "/links", { label: "x", hours: 24 * 15 })).status).toBe(422);
  });

  it("revoga (idempotente) e não mexe em link de outro evento", async () => {
    const created = (await (
      await post(t.eventA.id, "/links", { label: "Entrada lateral", hours: 2 })
    ).json()) as CheckinLinkCreated;
    const r1 = await post(t.eventA.id, `/links/${created.link.id}/revoke`);
    expect(r1.status).toBe(200);
    expect(((await r1.json()) as { link: { status: string } }).link.status).toBe("revoked");
    expect((await post(t.eventA.id, `/links/${created.link.id}/revoke`)).status).toBe(200);

    const b = (await (
      await post(t.eventB.id, "/links", { label: "Portaria B" }, stranger)
    ).json()) as CheckinLinkCreated;
    expect((await post(t.eventA.id, `/links/${b.link.id}/revoke`)).status).toBe(404);
    const [row] = await db.select().from(checkinLinks).where(eq(checkinLinks.id, b.link.id));
    expect(row!.revokedAt).toBeNull();
  });
});

describe("busca de convites", () => {
  it("por nome (sem acento) devolve só o que a portaria pode ver", async () => {
    const res = await get(t.eventA.id, "/invitations?q=silvanopolis");
    expect(res.status).toBe(200);
    const text = await res.text();
    for (const s of SENSITIVE) expect(text).not.toContain(s);
    expect(text).not.toContain(silva.token);
    expect(text).not.toContain("Carla"); // recusou: não está na lista da portaria
    const { invitations: found } = JSON.parse(text) as CheckinLookupResult;
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      label: "Família Silvanópolis",
      confirmed: 2,
      arrived: 0,
      accessNote: "Só cerimônia",
      people: [
        { name: "Ana Silvanópolis", isChild: false, table: "Mesa 3" },
        { name: "Bruno Silvanópolis", isChild: true, table: null },
      ],
    });
    expect(Object.keys(found[0]!).sort()).toEqual(
      ["accessNote", "arrivals", "arrived", "confirmed", "label", "people", "ref"].sort(),
    );
  });

  it("pelo código do QR (URL ou token); de outro evento → 404", async () => {
    const byUrl = await get(
      t.eventA.id,
      `/invitations?code=${encodeURIComponent(`https://site.exemplo/c/${silva.token}`)}`,
    );
    expect(byUrl.status).toBe(200);
    expect(((await byUrl.json()) as CheckinLookupResult).invitations[0]!.label).toBe(
      "Família Silvanópolis",
    );
    expect((await get(t.eventA.id, `/invitations?code=${silva.token.toLowerCase()}`)).status).toBe(
      200,
    );
    expect((await get(t.eventA.id, `/invitations?code=${outro.token}`)).status).toBe(404);
    expect((await get(t.eventA.id, "/invitations?code=nada-a-ver")).status).toBe(422);
    expect((await get(t.eventA.id, "/invitations?q=a")).status).toBe(422);
    // Busca por nome não atravessa evento.
    const other = (await (
      await get(t.eventA.id, "/invitations?q=Outrora")
    ).json()) as CheckinLookupResult;
    expect(other.invitations).toHaveLength(0);
  });
});

describe("chegadas", () => {
  it("parcial soma, passar das confirmadas é permitido e desfazer desconta", async () => {
    const before = ((await (await get(t.eventA.id, "")).json()) as CheckinOverview).totals;
    const found = (await (
      await get(t.eventA.id, "/invitations?q=Silvan")
    ).json()) as CheckinLookupResult;
    const ref = found.invitations[0]!.ref;

    const first = await post(t.eventA.id, "/arrivals", { ref, people: 1 });
    expect(first.status).toBe(201);
    const r1 = (await first.json()) as CheckinArrivalResult;
    expect(r1.invitation.arrived).toBe(1);
    expect(r1.totals.arrivedPeople).toBe(before.arrivedPeople + 1);
    expect(r1.totals.arrivedInvitations).toBe(before.arrivedInvitations + 1);
    expect(r1.invitation.arrivals[0]!.by).toBe("Teste owner");

    const r2 = (await (
      await post(t.eventA.id, "/arrivals", { ref, people: 2 })
    ).json()) as CheckinArrivalResult;
    expect(r2.invitation.arrived).toBe(3);
    expect(r2.invitation.confirmed).toBe(2);
    expect(r2.totals.arrivedInvitations).toBe(before.arrivedInvitations + 1);

    const firstId = r1.invitation.arrivals[0]!.id;
    const undo = await post(t.eventA.id, `/arrivals/${firstId}/undo`);
    expect(undo.status).toBe(200);
    const r3 = (await undo.json()) as CheckinArrivalResult;
    expect(r3.invitation.arrived).toBe(2);
    expect(r3.invitation.arrivals.find((a) => a.id === firstId)!.undoneAt).not.toBeNull();
    // De novo: nada muda.
    const again = (await (
      await post(t.eventA.id, `/arrivals/${firstId}/undo`)
    ).json()) as CheckinArrivalResult;
    expect(again.invitation.arrived).toBe(2);
    const [row] = await db.select().from(checkins).where(eq(checkins.id, firstId));
    expect(row).toBeDefined(); // desfazer não apaga

    const overview = (await (await get(t.eventA.id, "")).json()) as CheckinOverview;
    expect(overview.totals.arrivedPeople).toBe(before.arrivedPeople + 2);
    expect(overview.recent[0]).toMatchObject({ invitationLabel: "Família Silvanópolis", ref });
    for (const s of SENSITIVE) expect(JSON.stringify(overview)).not.toContain(s);
  });

  it("valida pessoas e recusa referência inventada ou de outro evento", async () => {
    const ref = invitationRef(env.BETTER_AUTH_SECRET, t.eventA.id, silva.id);
    expect((await post(t.eventA.id, "/arrivals", { ref, people: 0 })).status).toBe(422);
    // Referência do convite do evento B (assinada para B) no evento A.
    const refB = invitationRef(env.BETTER_AUTH_SECRET, t.eventB.id, outro.id);
    expect((await post(t.eventA.id, "/arrivals", { ref: refB, people: 1 })).status).toBe(404);
    // Id do convite B com a assinatura do A (o convite não é do A).
    const forged = invitationRef(env.BETTER_AUTH_SECRET, t.eventA.id, outro.id);
    expect((await post(t.eventA.id, "/arrivals", { ref: forged, people: 1 })).status).toBe(404);
    expect((await post(t.eventA.id, "/arrivals", { ref: "abc.xyz", people: 1 })).status).toBe(404);
    expect(
      (await post(t.eventA.id, "/arrivals", { ref: String(silva.id), people: 1 })).status,
    ).toBe(404);
  });

  it("desfazer chegada de outro evento → 404", async () => {
    const refB = invitationRef(env.BETTER_AUTH_SECRET, t.eventB.id, outro.id);
    const b = (await (
      await post(t.eventB.id, "/arrivals", { ref: refB, people: 1 }, stranger)
    ).json()) as CheckinArrivalResult;
    const id = b.invitation.arrivals[0]!.id;
    expect((await post(t.eventA.id, `/arrivals/${id}/undo`)).status).toBe(404);
    const [row] = await db.select().from(checkins).where(eq(checkins.id, id));
    expect(row!.undoneAt).toBeNull();
  });
});

describe("permissões", () => {
  it("quem não participa do evento recebe 404", async () => {
    expect((await get(t.eventA.id, "", stranger)).status).toBe(404);
    expect((await post(t.eventA.id, "/links", { label: "x" }, stranger)).status).toBe(404);
  });

  it("anfitrião pode tudo por padrão; a organização nega manage e depois read", async () => {
    expect((await get(t.eventA.id, "", host)).status).toBe(200);
    expect((await post(t.eventA.id, "/links", { label: "Do anfitrião" }, host)).status).toBe(201);

    await setEventSetting(
      db,
      t.eventA.id,
      "event.host_permissions",
      { deny: ["checkin.manage"] },
      false,
    );
    expect((await get(t.eventA.id, "", host)).status).toBe(200);
    expect((await get(t.eventA.id, "/invitations?q=Silvan", host)).status).toBe(200);
    expect((await post(t.eventA.id, "/links", { label: "Negado" }, host)).status).toBe(403);
    const ref = invitationRef(env.BETTER_AUTH_SECRET, t.eventA.id, silva.id);
    expect((await post(t.eventA.id, "/arrivals", { ref, people: 1 }, host)).status).toBe(403);

    await setEventSetting(
      db,
      t.eventA.id,
      "event.host_permissions",
      { deny: ["checkin.read"] },
      false,
    );
    expect((await get(t.eventA.id, "", host)).status).toBe(403);
    expect((await post(t.eventA.id, "/arrivals", { ref, people: 1 }, host)).status).toBe(403);
    // O dono continua podendo.
    expect((await get(t.eventA.id, "")).status).toBe(200);

    await setEventSetting(db, t.eventA.id, "event.host_permissions", { deny: [] }, false);
  });
});

describe("aviso da portaria no convite", () => {
  it("grava, mostra e não some quando o formulário não manda o campo", async () => {
    const base = {
      label: "Convite com aviso",
      side: "noiva",
      maxGuests: 1,
      guests: [{ name: "Elisa Aviso", rsvpStatus: "confirmed" }],
    };
    const res = await app.request(`/api/admin/events/${t.eventA.id}/invitations`, {
      method: "POST",
      headers: { cookie: owner, "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, accessNote: "Entrada pela lateral" }),
    });
    expect(res.status).toBe(201);
    const { invitation } = (await res.json()) as {
      invitation: { id: number; accessNote: string | null };
    };
    expect(invitation.accessNote).toBe("Entrada pela lateral");

    const put = (body: unknown) =>
      app.request(`/api/admin/events/${t.eventA.id}/invitations/${invitation.id}`, {
        method: "PUT",
        headers: { cookie: owner, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await put(base)).status).toBe(200);
    let [row] = await db.select().from(invitations).where(eq(invitations.id, invitation.id));
    expect(row!.accessNote).toBe("Entrada pela lateral");
    expect((await put({ ...base, accessNote: "" })).status).toBe(200);
    [row] = await db.select().from(invitations).where(eq(invitations.id, invitation.id));
    expect(row!.accessNote).toBeNull();
    expect((await put({ ...base, accessNote: "x".repeat(192) })).status).toBe(422);
  });
});
