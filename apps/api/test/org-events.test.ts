import {
  and,
  eq,
  eventDomains,
  eventSettings,
  events,
  giftOrders,
  gifts,
  guests,
  inArray,
  invitations,
  newPublicId,
  type Database,
} from "@casamento/db";
import {
  ERROR_CODES,
  type ApiError,
  type OrgDashboard,
  type OrgEventSummary,
  type SlugCheck,
} from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadSiteContent } from "../src/site-content.ts";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";

// Fase 3, frente A: dashboard multievento, lista, criação e status dos eventos da organização.

const revalidated: [number, string[]][] = [];
const { app, db } = testApp({
  revalidate: (id, tags) => {
    revalidated.push([id, tags]);
    return Promise.resolve();
  },
});

let ev!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
const createdSlugs: string[] = [];

const url = (orgId: number, path = "") => `/api/admin/orgs/${orgId}${path}`;
const run = (kind: TestUserKind, path: string, init: { method?: string; body?: unknown } = {}) =>
  app.request(path, {
    method: init.method ?? "GET",
    headers: { cookie: cookies[kind], "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

/** 4 convidados (2 confirmados, 1 pendente, 1 não vai) ou 2 (1 confirmado, 1 pendente). */
async function seedNumbers(database: Database, eventId: number, label: string, four: boolean) {
  const [g] = await database.insert(gifts).values({
    eventId,
    slug: `g-${label}`,
    title: `Presente ${label}`,
    priceCents: 5000,
    quotaTotal: 10,
    category: "casa",
    tileDesign: "flor",
  });
  const [inv] = await database.insert(invitations).values({
    eventId,
    token: newPublicId(),
    label: `Convite ${label}`,
    side: "a",
    maxGuests: 4,
  });
  const statuses = four
    ? (["confirmed", "confirmed", "pending", "declined"] as const)
    : (["confirmed", "pending"] as const);
  await database.insert(guests).values(
    statuses.map((rsvpStatus, i) => ({
      eventId,
      invitationId: inv.insertId,
      name: `Convidado ${label} ${i}`,
      rsvpStatus,
    })),
  );
  return g.insertId;
}

async function order(
  eventId: number,
  giftId: number,
  cents: number,
  status: "paid" | "refunded" | "pending",
) {
  await db.insert(giftOrders).values({
    publicId: newPublicId(),
    eventId,
    giftId,
    amountCents: cents,
    buyerName: "Comprador",
    buyerEmail: "c@exemplo.com",
    status,
    expiresAt: new Date("2031-01-01T00:00:00Z"),
  });
}

beforeAll(async () => {
  ev = await createTestEvents(db);
  for (const kind of ["owner", "member", "stranger", "host", "platformAdmin"] as const) {
    cookies[kind] = await ev.login(app, kind);
  }
  const gA = await seedNumbers(db, ev.eventA.id, "a", true);
  await order(ev.eventA.id, gA, 5000, "paid");
  await order(ev.eventA.id, gA, 2500, "paid");
  await order(ev.eventA.id, gA, 9000, "refunded");
  await order(ev.eventA.id, gA, 1000, "pending");
  const gB = await seedNumbers(db, ev.eventB.id, "b", false);
  await order(ev.eventB.id, gB, 99_999, "paid");
});

afterAll(async () => {
  if (createdSlugs.length) {
    await db.delete(events).where(inArray(events.slug, createdSlugs));
  }
  await ev?.cleanup();
  await db.$client.end();
});

describe("dashboard da organização", () => {
  it("conta só os eventos da org, com centavos de pedidos pagos (sem reembolsados)", async () => {
    const res = await run("owner", url(ev.orgA.id, "/dashboard"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as OrgDashboard;
    expect(body.organization.id).toBe(ev.orgA.id);
    expect(body.role).toBe("org_owner");
    expect(body.events.map((e) => e.id).sort()).toEqual([ev.eventA.id, ev.draftA.id].sort());
    const a = body.events.find((e) => e.id === ev.eventA.id)!;
    expect(a).toMatchObject({
      invitations: 1,
      guests: 4,
      confirmed: 2,
      giftsPaid: 2,
      giftsReceivedCents: 7500,
      primaryHost: ev.primaryHostA,
      status: "active",
    });
    expect(body.events.find((e) => e.id === ev.draftA.id)).toMatchObject({
      guests: 0,
      giftsReceivedCents: 0,
      primaryHost: null,
    });
    expect(body.totals).toEqual({ events: 2, guests: 4, confirmed: 2, giftsReceivedCents: 7500 });
  });

  it("membro lê; anfitrião, estranho e org inexistente recebem 404 de rota", async () => {
    expect((await run("member", url(ev.orgA.id, "/dashboard"))).status).toBe(200);
    expect((await run("platformAdmin", url(ev.orgB.id, "/dashboard"))).status).toBe(200);
    for (const kind of ["host", "stranger"] as const) {
      expect((await run(kind, url(ev.orgA.id, "/dashboard"))).status, kind).toBe(404);
    }
    expect((await run("platformAdmin", url(999_999_999, "/dashboard"))).status).toBe(404);
  });

  it("org B não vê nada da A", async () => {
    const res = await run("stranger", url(ev.orgB.id, "/dashboard"));
    const body = (await res.json()) as OrgDashboard;
    expect(body.events.map((e) => e.id)).toEqual([ev.eventB.id]);
    expect(body.totals.giftsReceivedCents).toBe(99_999);
    expect(body.totals.guests).toBe(2);
  });
});

describe("lista e endereço", () => {
  it("lista os eventos da org", async () => {
    const res = await run("member", url(ev.orgA.id, "/events"));
    const body = (await res.json()) as { events: OrgEventSummary[] };
    expect(body.events.map((e) => e.slug).sort()).toEqual([ev.eventA.slug, ev.draftA.slug].sort());
  });

  it("slug-check: livre, em uso e inválido", async () => {
    const check = async (slug: string) => {
      const res = await run("owner", url(ev.orgA.id, `/events/slug-check?slug=${slug}`));
      return (await res.json()) as SlugCheck;
    };
    expect((await check(`livre-${ev.run}`)).available).toBe(true);
    const taken = await check(ev.eventB.slug); // slug é global: o de outra org também conta
    expect(taken.available).toBe(false);
    expect(taken.message).toMatch(/em uso/);
    const bad = await check("Ruim_Slug");
    expect(bad.available).toBe(false);
    expect(bad.message).toBeTruthy();
  });
});

describe("criar evento", () => {
  const input = (slug: string, extra: Record<string, unknown> = {}) => ({
    name: "Aniversário da Lia",
    type: "birthday",
    slug,
    date: "2031-07-15",
    time: "19:30",
    ...extra,
  });

  it("cria rascunho com os padrões do tipo e a data com offset do fuso", async () => {
    const slug = `lia-${ev.run}`;
    createdSlugs.push(slug);
    const host = `lia-${ev.run}.teste.local`;
    const res = await run("owner", url(ev.orgA.id, "/events"), {
      method: "POST",
      body: input(slug, { host }),
    });
    expect(res.status).toBe(201);
    const { event } = (await res.json()) as { event: OrgEventSummary };
    expect(event).toMatchObject({
      slug,
      type: "birthday",
      status: "draft",
      timezone: "America/Sao_Paulo",
      primaryHost: host,
      guests: 0,
    });
    expect(event.startsAt).toBe("2031-07-15T22:30:00.000Z");

    const [row] = await db.select().from(events).where(eq(events.slug, slug));
    expect(row!.organizationId).toBe(ev.orgA.id);
    const [dom] = await db.select().from(eventDomains).where(eq(eventDomains.host, host));
    expect(dom).toMatchObject({ eventId: row!.id, isPrimary: true });

    // Só os quatro dados do evento foram gravados; o resto vale pelo padrão do tipo.
    const keys = (
      await db
        .select({ key: eventSettings.key })
        .from(eventSettings)
        .where(eq(eventSettings.eventId, row!.id))
    ).map((r) => r.key);
    expect(keys.sort()).toEqual(
      ["couple.monogram", "couple.names", "wedding.datetime", "wedding.timezone"].sort(),
    );
    const content = await loadSiteContent(
      {
        id: row!.id,
        slug,
        orgId: ev.orgA.id,
        timezone: row!.timezone,
        name: row!.name,
        type: row!.type,
        status: "draft",
        startsAt: row!.startsAt,
      },
      db,
    );
    expect(JSON.stringify(content)).toContain("Aniversário da Lia");
  });

  it("membro e platform admin criam; anfitrião e estranho não entram", async () => {
    const m = `lia-m-${ev.run}`;
    const p = `lia-p-${ev.run}`;
    createdSlugs.push(m, p);
    const byMember = await run("member", url(ev.orgA.id, "/events"), {
      method: "POST",
      body: input(m),
    });
    expect(byMember.status).toBe(201);
    const res = await run("platformAdmin", url(ev.orgB.id, "/events"), {
      method: "POST",
      body: input(p),
    });
    expect(res.status).toBe(201);
    const [row] = await db.select().from(events).where(eq(events.slug, p));
    expect(row!.organizationId).toBe(ev.orgB.id);
    for (const kind of ["host", "stranger"] as const) {
      const r = await run(kind, url(ev.orgA.id, "/events"), {
        method: "POST",
        body: input(`nao-${kind}-${ev.run}`),
      });
      expect(r.status, kind).toBe(404);
    }
    const none = await db
      .select()
      .from(events)
      .where(eq(events.slug, `nao-stranger-${ev.run}`));
    expect(none.length).toBe(0);
  });

  it("slug repetido e domínio repetido dão 409; entrada inválida dá 422", async () => {
    const dup = await run("owner", url(ev.orgA.id, "/events"), {
      method: "POST",
      body: input(ev.eventB.slug),
    });
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as ApiError).error).toMatchObject({
      code: ERROR_CODES.conflict,
      field: "slug",
    });

    const slug = `lia-h-${ev.run}`;
    createdSlugs.push(slug);
    const host = await run("owner", url(ev.orgA.id, "/events"), {
      method: "POST",
      body: input(slug, { host: ev.primaryHostA }),
    });
    expect(host.status).toBe(409);
    expect(((await host.json()) as { error: { field: string } }).error.field).toBe("host");
    expect((await db.select().from(events).where(eq(events.slug, slug))).length).toBe(0);

    for (const bad of [
      input("Ruim Slug"),
      input("ok-slug", { name: "  " }),
      input("ok-slug", { type: "inexistente" }),
      input("ok-slug", { date: "15/07/2031" }),
      input("ok-slug", { timezone: "Marte/Olimpo" }),
      input("ok-slug", { host: "não é host" }),
    ]) {
      const r = await run("owner", url(ev.orgA.id, "/events"), { method: "POST", body: bad });
      expect(r.status, JSON.stringify(bad)).toBe(422);
    }
  });
});

describe("mudar status", () => {
  it("ativa e arquiva evento da org e revalida o site", async () => {
    revalidated.length = 0;
    const res = await run("member", url(ev.orgA.id, `/events/${ev.draftA.id}`), {
      method: "PATCH",
      body: { status: "active" },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { event: OrgEventSummary }).event.status).toBe("active");
    expect(revalidated).toContainEqual([ev.draftA.id, ["site"]]);

    const back = await run("owner", url(ev.orgA.id, `/events/${ev.draftA.id}`), {
      method: "PATCH",
      body: { status: "archived" },
    });
    expect(back.status).toBe(200);
    const [row] = await db.select().from(events).where(eq(events.id, ev.draftA.id));
    expect(row!.status).toBe("archived");
  });

  it("evento de outra org (ou inexistente) dá 404 e nada muda", async () => {
    for (const id of [ev.eventB.id, 999_999_999]) {
      const r = await run("owner", url(ev.orgA.id, `/events/${id}`), {
        method: "PATCH",
        body: { status: "archived" },
      });
      expect(r.status).toBe(404);
    }
    const [b] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, ev.eventB.id)));
    expect(b!.status).toBe("active");
  });

  it("status inválido dá 422; anfitrião dá 404", async () => {
    const bad = await run("owner", url(ev.orgA.id, `/events/${ev.eventA.id}`), {
      method: "PATCH",
      body: { status: "apagado" },
    });
    expect(bad.status).toBe(422);
    const host = await run("host", url(ev.orgA.id, `/events/${ev.eventA.id}`), {
      method: "PATCH",
      body: { status: "archived" },
    });
    expect(host.status).toBe(404);
  });
});
