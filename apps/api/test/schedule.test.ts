import { eventVendors, vendors } from "@casamento/db";
import { localDateTimeToIso, type ScheduleItemRow, type ScheduleView } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toLocalParts } from "../src/schedule/time.ts";
import { createTestEvents, setEventSetting, testApp, type TestEvents } from "./helpers.ts";

// Fase 4, frente D: cronograma do dia. Evento A (org A, fuso America/Sao_Paulo, 2030-01-01 12:00 local).

const { app, db } = testApp();
let t!: TestEvents;
let owner = "";
let host = "";
let stranger = "";
let vendorA = 0;
let vendorB = 0;

const url = (id: number, path = "") => `/api/admin/events/${id}/schedule${path}`;
const send = (id: number, method: string, path: string, body: unknown, cookie = owner) =>
  app.request(url(id, path), {
    method,
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const list = async (id = t.eventA.id, cookie = owner) =>
  (await (await app.request(url(id), { headers: { cookie } })).json()) as ScheduleView;

async function newEventVendor(orgId: number, eventId: number, name: string) {
  const [v] = await db.insert(vendors).values({ organizationId: orgId, name, category: "photo" });
  const [ev] = await db
    .insert(eventVendors)
    .values({ eventId, organizationId: orgId, vendorId: v.insertId, category: "photo" });
  return ev.insertId;
}

beforeAll(async () => {
  t = await createTestEvents(db);
  owner = await t.login(app, "owner");
  host = await t.login(app, "host");
  stranger = await t.login(app, "stranger");
  vendorA = await newEventVendor(t.orgA.id, t.eventA.id, "Fotógrafa A");
  vendorB = await newEventVendor(t.orgB.id, t.eventB.id, "Buffet B");
});

afterAll(async () => {
  await t.cleanup();
  await db.$client.end();
});

describe("horário local e UTC", () => {
  it("converte ida e volta no fuso do evento", () => {
    const iso = localDateTimeToIso("2030-01-01", "23:30", "America/Sao_Paulo");
    expect(new Date(iso).toISOString()).toBe("2030-01-02T02:30:00.000Z");
    expect(toLocalParts(new Date(iso), "America/Sao_Paulo")).toEqual({
      date: "2030-01-01",
      time: "23:30",
    });
  });
  it("respeita horário de verão (Nova York)", () => {
    // 2030-03-10 02:00 EST vira EDT às 03:00: 12:00 local = 16:00Z; em janeiro = 17:00Z.
    expect(
      new Date(localDateTimeToIso("2030-03-11", "12:00", "America/New_York")).toISOString(),
    ).toBe("2030-03-11T16:00:00.000Z");
    expect(
      new Date(localDateTimeToIso("2030-01-11", "12:00", "America/New_York")).toISOString(),
    ).toBe("2030-01-11T17:00:00.000Z");
  });
});

describe("CRUD do cronograma", () => {
  it("cria no dia do evento, ordena por horário e devolve hora local", async () => {
    const mk = (startTime: string, title: string, extra = {}) =>
      send(t.eventA.id, "POST", "", { startTime, title, ...extra });
    const late = await mk("21:00", "Bolo", { endTime: "01:00", location: "Salão" });
    expect(late.status).toBe(201);
    const lateItem = ((await late.json()) as { item: ScheduleItemRow }).item;
    expect(lateItem).toMatchObject({
      date: "2030-01-01",
      startTime: "21:00",
      endTime: "01:00",
      location: "Salão",
    });
    // fim antes do início = dia seguinte (meia-noite passada)
    expect(new Date(lateItem.endsAt!).getTime() - new Date(lateItem.startsAt).getTime()).toBe(
      4 * 3600_000,
    );
    await mk("16:00", "Cerimônia", { eventVendorId: vendorA });
    const view = await list();
    expect(view.eventDate).toBe("2030-01-01");
    expect(view.items.map((i) => i.title)).toEqual(["Cerimônia", "Bolo"]);
    expect(view.items[0]!.eventVendor).toEqual({ id: vendorA, name: "Fotógrafa A" });
  });

  it("PATCH muda só o enviado e mantém o fornecedor e o fim", async () => {
    const [first] = (await list()).items;
    const res = await send(t.eventA.id, "PATCH", `/${first!.id}`, { title: "Cerimônia civil" });
    expect(res.status).toBe(200);
    const item = ((await res.json()) as { item: ScheduleItemRow }).item;
    expect(item).toMatchObject({ title: "Cerimônia civil", startTime: "16:00" });
    expect(item.eventVendor?.id).toBe(vendorA);
    const moved = await send(t.eventA.id, "PATCH", `/${first!.id}`, { startTime: "22:00" });
    expect(((await moved.json()) as { item: ScheduleItemRow }).item.startTime).toBe("22:00");
  });

  it("recusa fim igual ao início e fornecedor de outro evento (422)", async () => {
    const same = await send(t.eventA.id, "POST", "", {
      startTime: "10:00",
      endTime: "10:00",
      title: "X",
    });
    expect(same.status).toBe(422);
    const foreign = await send(t.eventA.id, "POST", "", {
      startTime: "10:00",
      title: "X",
      eventVendorId: vendorB,
    });
    expect(foreign.status).toBe(422);
    expect(((await foreign.json()) as { error: { field: string } }).error.field).toBe(
      "eventVendorId",
    );
    const [item] = (await list()).items;
    const patch = await send(t.eventA.id, "PATCH", `/${item!.id}`, { eventVendorId: vendorB });
    expect(patch.status).toBe(422);
  });

  it("exclui", async () => {
    const [item] = (await list()).items;
    const res = await app.request(url(t.eventA.id, `/${item!.id}`), {
      method: "DELETE",
      headers: { cookie: owner },
    });
    expect(res.status).toBe(200);
    expect((await list()).items.find((i) => i.id === item!.id)).toBeUndefined();
  });
});

describe("isolamento e permissões", () => {
  it("item de outro evento e evento alheio dão 404", async () => {
    const [item] = (await list()).items;
    // quem não é do evento A não o enxerga
    const res = await app.request(url(t.eventA.id), { headers: { cookie: stranger } });
    expect(res.status).toBe(404);
    // o dono da org B mexe no evento B, mas o item do evento A não existe lá
    const own = await send(t.eventB.id, "PATCH", `/${item!.id}`, { title: "Y" }, stranger);
    expect(own.status).toBe(404);
    const del = await app.request(url(t.eventB.id, `/${item!.id}`), {
      method: "DELETE",
      headers: { cookie: stranger },
    });
    expect(del.status).toBe(404);
    expect((await list(t.eventB.id, stranger)).items).toEqual([]);
  });

  it("anfitrião sem schedule.read recebe 403; sem schedule.write só lê", async () => {
    await setEventSetting(
      db,
      t.eventA.id,
      "event.host_permissions",
      { deny: ["schedule.write"] },
      false,
    );
    expect((await app.request(url(t.eventA.id), { headers: { cookie: host } })).status).toBe(200);
    const w = await send(t.eventA.id, "POST", "", { startTime: "09:00", title: "Z" }, host);
    expect(w.status).toBe(403);
    await setEventSetting(
      db,
      t.eventA.id,
      "event.host_permissions",
      { deny: ["schedule.read"] },
      false,
    );
    expect((await app.request(url(t.eventA.id), { headers: { cookie: host } })).status).toBe(403);
    await setEventSetting(db, t.eventA.id, "event.host_permissions", { deny: [] }, false);
    expect((await app.request(url(t.eventA.id), { headers: { cookie: host } })).status).toBe(200);
  });
});
