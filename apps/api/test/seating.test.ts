import { eq, guests, invitations, newPublicId, seatAssignments } from "@casamento/db";
import type { SeatingTableView, SeatingView } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestEvents, setEventSetting, testApp, type TestEvents } from "./helpers.ts";

// Fase 7, frente B: mapa de mesas. Evento A (org A) e evento B (org B) para o isolamento.

const { app, db } = testApp();
let t!: TestEvents;
let owner = "";
let host = "";
let stranger = "";
const ids = {} as Record<"ana" | "bia" | "caio" | "duda" | "edu" | "bruno", number>;

const url = (id: number, path = "") => `/api/admin/events/${id}/seating${path}`;
const send = (id: number, method: string, path: string, body: unknown, cookie = owner) =>
  app.request(url(id, path), {
    method,
    headers: { cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const view = async (id = t.eventA.id, query = "", cookie = owner) =>
  (await (await app.request(url(id, query), { headers: { cookie } })).json()) as SeatingView;
const mkTable = async (body: Record<string, unknown>, id = t.eventA.id, cookie = owner) =>
  (
    (await (await send(id, "POST", "/tables", body, cookie)).json()) as {
      table: SeatingTableView;
    }
  ).table;
const assign = (assignments: unknown[], id = t.eventA.id, cookie = owner) =>
  send(id, "PUT", "/assignments", { assignments }, cookie);

async function person(eventId: number, name: string, rsvp: "pending" | "confirmed" | "declined") {
  const [inv] = await db.insert(invitations).values({
    eventId,
    token: newPublicId(),
    label: `Convite ${name}`,
    side: "dani",
    maxGuests: 2,
  });
  const [g] = await db
    .insert(guests)
    .values({ eventId, invitationId: inv.insertId, name, rsvpStatus: rsvp });
  return { guestId: g.insertId, invitationId: inv.insertId };
}

beforeAll(async () => {
  t = await createTestEvents(db);
  owner = await t.login(app, "owner");
  host = await t.login(app, "host");
  stranger = await t.login(app, "stranger");
  const a = t.eventA.id;
  ids.ana = (await person(a, "Ana", "confirmed")).guestId;
  ids.bia = (await person(a, "Bia", "confirmed")).guestId;
  ids.caio = (await person(a, "Caio", "confirmed")).guestId;
  ids.duda = (await person(a, "Duda", "pending")).guestId;
  ids.edu = (await person(a, "Edu", "declined")).guestId;
  ids.bruno = (await person(t.eventB.id, "Bruno", "confirmed")).guestId;
});

afterAll(async () => {
  await t.cleanup();
  await db.$client.end();
});

describe("mesas", () => {
  it("CRUD, ordem e lado válido", async () => {
    const res = await send(t.eventA.id, "POST", "/tables", { name: "Mesa 1", seats: 2 });
    expect(res.status).toBe(201);
    const one = ((await res.json()) as { table: SeatingTableView }).table;
    expect(one).toMatchObject({ name: "Mesa 1", seats: 2, side: null, overCapacity: false });
    const two = await mkTable({ name: "Mesa 2", groupLabel: "Amigos" });
    expect(two.seats).toBe(8);
    expect(two.sort).toBeGreaterThan(one.sort);

    expect((await send(t.eventA.id, "POST", "/tables", { name: " " })).status).toBe(422);
    const badSide = await send(t.eventA.id, "POST", "/tables", { name: "X", side: "nao-existe" });
    expect(badSide.status).toBe(422);

    const patch = await send(t.eventA.id, "PATCH", `/tables/${two.id}`, { name: "Mesa dois" });
    expect(((await patch.json()) as { table: SeatingTableView }).table).toMatchObject({
      name: "Mesa dois",
      groupLabel: "Amigos",
    });

    const order = await send(t.eventA.id, "PUT", "/tables/order", { ids: [two.id, one.id] });
    expect(order.status).toBe(200);
    expect((await view()).tables.map((x) => x.id)).toEqual([two.id, one.id]);
    const dup = await send(t.eventA.id, "PUT", "/tables/order", { ids: [one.id, one.id] });
    expect(dup.status).toBe(422);
  });
});

describe("distribuição", () => {
  let m1 = 0;
  let m2 = 0;
  beforeAll(async () => {
    const tables = (await view()).tables;
    m1 = tables.find((x) => x.name === "Mesa 1")!.id;
    m2 = tables.find((x) => x.name === "Mesa dois")!.id;
  });

  it("só confirmados sem mesa por padrão; ?all=1 inclui pendentes", async () => {
    const v = await view();
    expect(v.unassigned.map((g) => g.name).sort()).toEqual(["Ana", "Bia", "Caio"]);
    expect(v.stats.confirmed).toBe(3);
    const all = await view(t.eventA.id, "?all=1");
    expect(all.unassigned.map((g) => g.name)).toContain("Duda");
    expect(all.unassigned.map((g) => g.name)).not.toContain("Edu");
  });

  it("lota acima dos lugares como aviso, não bloqueio", async () => {
    const res = await assign([
      { guestId: ids.ana, tableId: m1 },
      { guestId: ids.bia, tableId: m1 },
      { guestId: ids.caio, tableId: m1 },
    ]);
    expect(res.status).toBe(200);
    const v = (await res.json()) as SeatingView;
    const table = v.tables.find((x) => x.id === m1)!;
    expect(table.guests).toHaveLength(3);
    expect(table.overCapacity).toBe(true);
    expect(v.stats).toMatchObject({ tables: 2, seated: 3, seatedNotConfirmed: 0 });
    expect(v.unassigned.filter((g) => g.rsvpStatus === "confirmed")).toEqual([]);
  });

  it("mover troca a mesa (uma mesa por pessoa) e tirar devolve a sem mesa", async () => {
    await assign([{ guestId: ids.caio, tableId: m2 }]);
    let v = await view();
    expect(v.tables.find((x) => x.id === m1)!.guests.map((g) => g.name)).toEqual(["Ana", "Bia"]);
    expect(v.tables.find((x) => x.id === m2)!.guests.map((g) => g.name)).toEqual(["Caio"]);
    const rows = await db
      .select()
      .from(seatAssignments)
      .where(eq(seatAssignments.guestId, ids.caio));
    expect(rows).toHaveLength(1);
    await assign([{ guestId: ids.caio, tableId: null }]);
    v = await view();
    expect(v.unassigned.map((g) => g.name)).toEqual(["Caio"]);
  });

  it("trocar duas pessoas de lugar de uma vez; lugar repetido dá 409", async () => {
    const first = await assign([
      { guestId: ids.ana, tableId: m1, seat: 1 },
      { guestId: ids.bia, tableId: m1, seat: 2 },
    ]);
    expect(first.status).toBe(200);
    const swap = await assign([
      { guestId: ids.ana, tableId: m1, seat: 2 },
      { guestId: ids.bia, tableId: m1, seat: 1 },
    ]);
    expect(swap.status).toBe(200);
    const names = ((await swap.json()) as SeatingView).tables
      .find((x) => x.id === m1)!
      .guests.map((g) => g.name);
    expect(names).toEqual(["Bia", "Ana"]);

    // Lugar ocupado por outra pessoa que não está no pedido.
    expect((await assign([{ guestId: ids.caio, tableId: m1, seat: 1 }])).status).toBe(409);
    // Dois no mesmo lugar no mesmo pedido: nada muda.
    const same = await assign([
      { guestId: ids.caio, tableId: m2, seat: 3 },
      { guestId: ids.duda, tableId: m2, seat: 3 },
    ]);
    expect(same.status).toBe(409);
    expect((await view()).tables.find((x) => x.id === m2)!.guests).toEqual([]);
    // Lugar acima da quantidade da mesa e pessoa repetida no pedido.
    expect((await assign([{ guestId: ids.caio, tableId: m1, seat: 9 }])).status).toBe(422);
    const twice = await assign([
      { guestId: ids.caio, tableId: m1 },
      { guestId: ids.caio, tableId: m2 },
    ]);
    expect(twice.status).toBe(422);
  });

  it("quem recusa depois de sentado aparece em seatedNotConfirmed", async () => {
    await db.update(guests).set({ rsvpStatus: "declined" }).where(eq(guests.id, ids.ana));
    const v = await view();
    expect(v.stats.seatedNotConfirmed).toBe(1);
    expect(v.stats.confirmed).toBe(2);
    await db.update(guests).set({ rsvpStatus: "confirmed" }).where(eq(guests.id, ids.ana));
  });

  it("apagar mesa devolve as pessoas a sem mesa; apagar convite limpa a atribuição", async () => {
    const res = await send(t.eventA.id, "DELETE", `/tables/${m1}`, undefined);
    expect(res.status).toBe(200);
    const v = await view();
    expect(v.unassigned.map((g) => g.name).sort()).toEqual(["Ana", "Bia", "Caio"]);

    const extra = await person(t.eventA.id, "Fabi", "confirmed");
    await assign([{ guestId: extra.guestId, tableId: m2 }]);
    await db.delete(invitations).where(eq(invitations.id, extra.invitationId));
    const left = await db
      .select()
      .from(seatAssignments)
      .where(eq(seatAssignments.guestId, extra.guestId));
    expect(left).toEqual([]);
    expect((await view()).tables.find((x) => x.id === m2)!.guests).toEqual([]);
  });
});

describe("isolamento e permissões", () => {
  it("pessoa e mesa de outro evento dão 404; estranho não entra no evento", async () => {
    const mine = await mkTable({ name: "Mesa A3" });
    expect((await assign([{ guestId: ids.bruno, tableId: mine.id }])).status).toBe(404);

    const other = await mkTable({ name: "Mesa B" }, t.eventB.id, stranger);
    expect(other.name).toBe("Mesa B");
    expect((await assign([{ guestId: ids.ana, tableId: other.id }])).status).toBe(404);
    expect((await send(t.eventA.id, "PATCH", `/tables/${other.id}`, { name: "x" })).status).toBe(
      404,
    );
    expect((await send(t.eventA.id, "DELETE", `/tables/${other.id}`, undefined)).status).toBe(404);
    expect((await send(t.eventA.id, "PUT", "/tables/order", { ids: [other.id] })).status).toBe(404);
    // O dono da org A não enxerga o evento B (404) e a mesa B continua intacta.
    expect((await app.request(url(t.eventB.id), { headers: { cookie: owner } })).status).toBe(404);
    expect((await view(t.eventB.id, "", stranger)).tables.map((x) => x.name)).toEqual(["Mesa B"]);
    expect((await view(t.eventA.id)).tables.map((x) => x.name)).not.toContain("Mesa B");
  });

  it("anfitrião: sem seating.write lê e não escreve; sem seating.read, 403", async () => {
    const deny = (list: string[]) =>
      setEventSetting(db, t.eventA.id, "event.host_permissions", { deny: list }, false);
    await deny(["seating.write"]);
    expect((await app.request(url(t.eventA.id), { headers: { cookie: host } })).status).toBe(200);
    expect((await send(t.eventA.id, "POST", "/tables", { name: "Z" }, host)).status).toBe(403);
    expect((await assign([{ guestId: ids.ana, tableId: null }], t.eventA.id, host)).status).toBe(
      403,
    );
    await deny(["seating.read"]);
    expect((await app.request(url(t.eventA.id), { headers: { cookie: host } })).status).toBe(403);
    expect((await send(t.eventA.id, "POST", "/tables", { name: "Z" }, host)).status).toBe(403);
    await deny([]);
    expect((await app.request(url(t.eventA.id), { headers: { cookie: host } })).status).toBe(200);
  });

  it("listas do cerimonial e da portaria trazem a mesa", async () => {
    const tables = (await view()).tables;
    await assign([{ guestId: ids.ana, tableId: tables[0]!.id }]);
    for (const kind of ["cerimonial", "portaria"]) {
      const res = await app.request(`/api/admin/events/${t.eventA.id}/invitations/lists/${kind}`, {
        headers: { cookie: owner },
      });
      const { list } = (await res.json()) as { list: { columns: string[]; rows: string[][] } };
      const col = list.columns.indexOf("Mesa");
      expect(col, kind).toBeGreaterThan(-1);
      const row = list.rows.find((r) => r.includes("Ana"))!;
      expect(row[col]).toBe(tables[0]!.name);
    }
  });
});
