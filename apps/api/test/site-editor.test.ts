import { and, eq, eventMedia, eventSettings } from "@casamento/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CacheTag } from "../src/admin/index.ts";
import type { Mailer } from "../src/mailer.ts";
import { createTestEvents, testApp, type TestEvents } from "./helpers.ts";

// Frente A (Fase 2): PUT /api/admin/events/:eventId/site.

const mailer: Mailer = { send: () => Promise.resolve() };
const revalidated: { eventId: number; tags: CacheTag[] }[] = [];
const { app, db } = testApp({
  mailer,
  revalidate: (eventId, tags) => {
    revalidated.push({ eventId, tags });
    return Promise.resolve();
  },
});

let t!: TestEvents;
let host = "";
let stranger = "";
let mediaB = 0;
type Ev = { id: number };
const site = (ev: Ev) => `/api/admin/events/${ev.id}/site`;
const put = (ev: Ev, body: unknown, cookie = host) =>
  app.request(site(ev), {
    method: "PUT",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const get = async (ev: Ev, cookie = host) =>
  (await (await app.request(site(ev), { headers: { cookie } })).json()) as {
    isDefault: boolean;
    sections: { hero: { kicker: string } };
  };

beforeAll(async () => {
  t = await createTestEvents(db);
  host = await t.login(app, "host");
  stranger = await t.login(app, "stranger");
  const [r] = await db.insert(eventMedia).values({
    eventId: t.eventB.id,
    file: "01AAAAAAAAAAAAAAAAAAAAAAAA.png",
    mime: "image/png",
    width: 10,
    height: 10,
    bytes: 10,
  });
  mediaB = r.insertId;
});

afterAll(async () => {
  await t.cleanup();
  await db.$client.end();
});

describe("PUT /site", () => {
  it("GET abre com o padrão; PUT grava (parcial vale), publica e revalida", async () => {
    expect((await get(t.eventA)).isDefault).toBe(true);
    const res = await put(t.eventA, { sections: { hero: { kicker: "Oi, gente" } } });
    expect(res.status).toBe(200);
    expect(revalidated.at(-1)).toEqual({ eventId: t.eventA.id, tags: ["site"] });
    const again = await get(t.eventA);
    expect(again.isDefault).toBe(false);
    expect(again.sections.hero.kicker).toBe("Oi, gente");
    const [row] = await db
      .select({ isPublic: eventSettings.isPublic })
      .from(eventSettings)
      .where(and(eq(eventSettings.eventId, t.eventA.id), eq(eventSettings.key, "site.sections")));
    expect(row?.isPublic).toBe(true);
  });

  it("recusa corpo inválido e link inseguro", async () => {
    expect((await put(t.eventA, {})).status).toBe(422);
    const bad = await put(t.eventA, {
      sections: { nav: { extras: [{ text: "x", link: "javascript:alert(1)" }] } },
    });
    expect(bad.status).toBe(422);
  });

  it("recusa mediaId de outro evento ou inexistente", async () => {
    const other = await put(t.eventA, {
      sections: { hero: { photoDesktop: { mediaId: mediaB } } },
    });
    expect(other.status).toBe(422);
    const none = await put(t.eventA, {
      sections: { hero: { photoDesktop: { mediaId: 987654321 } } },
    });
    expect(none.status).toBe(422);
  });

  it("quem não é do evento recebe 404 e nada é gravado", async () => {
    expect(
      (await put(t.eventA, { sections: { hero: { kicker: "invasor" } } }, stranger)).status,
    ).toBe(404);
    expect((await get(t.eventA)).sections.hero.kicker).toBe("Oi, gente");
    expect((await get(t.eventB, stranger)).isDefault).toBe(true);
  });
});
