import { events, eq, eventSettings, guests, invitations, and } from "@casamento/db";
import { legacySections } from "@casamento/db";
import { ApiError, SiteContent, SiteSections } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mailer } from "../src/mailer.ts";
import {
  createTestEvents,
  setEventSetting,
  TEST_WEB_KEY,
  testApp,
  type TestEvents,
} from "./helpers.ts";

// PUT /config (tipo, módulos, lados, vocabulário): permissões, CSRF, validação, lado em uso,
// cache do resolver, revalidação e isolamento entre eventos. O auditor de SQL estrito vale.

const mailer: Mailer = { send: () => Promise.resolve() };
const revalidated: { eventId: number; tags: string[] }[] = [];
const { app, db } = testApp({
  mailer,
  revalidate: (eventId, tags) => {
    revalidated.push({ eventId, tags });
    return Promise.resolve();
  },
});

let t!: TestEvents;
let cookie = "";
interface ConfigJson {
  type: string;
  sides: { key: string }[];
  vocabulary: Record<string, string>;
  vocabularyOverrides: Record<string, string>;
  modules: Record<string, boolean>;
}
const config = (eventId: number) => `/api/admin/events/${eventId}/config`;

const body = (over: Record<string, unknown> = {}) => ({
  type: "fifteen",
  modules: { gifts: false, messages: true, godparents: false },
  sides: [
    { key: "familia", label: "Família" },
    { key: "amigos", label: "Amigos" },
  ],
  vocabulary: { hosts: "a debutante Lia" },
  ...over,
});
const put = (eventId: number, payload: unknown, headers: Record<string, string> = {}) =>
  app.request(config(eventId), {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie, ...headers },
    body: JSON.stringify(payload),
  });

beforeAll(async () => {
  t = await createTestEvents(db);
  for (const ev of [t.eventA, t.eventB]) {
    await setEventSetting(db, ev.id, "couple.names", ev.name);
    await setEventSetting(db, ev.id, "couple.monogram", "EV");
    await setEventSetting(db, ev.id, "wedding.datetime", "2030-01-01T12:00:00-03:00");
    await setEventSetting(db, ev.id, "wedding.timezone", "America/Sao_Paulo");
  }
  cookie = await t.login(app, "host");
});

afterAll(async () => {
  await t.cleanup();
  await db.$client.end();
});

describe("GET /config", () => {
  it("evento sem nada gravado: padrão do tipo (casamento: Noiva/Noivo)", async () => {
    const res = await app.request(config(t.eventA.id), { headers: { cookie } });
    expect(res.status).toBe(200);
    const json = (await res.json()) as ConfigJson;
    expect(json.type).toBe("wedding");
    expect(json.sides.map((s) => s.key)).toEqual(["noiva", "noivo"]);
    expect(json.vocabulary.hosts).toBe("os noivos");
  });
});

describe("PUT /config: acesso", () => {
  it("sem sessão: 401", async () => {
    const res = await app.request(config(t.eventA.id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body()),
    });
    expect(res.status).toBe(401);
  });

  it("origem de outro site: 403 (CSRF)", async () => {
    const res = await put(t.eventA.id, body(), { Origin: "https://evil.example.com" });
    expect(res.status).toBe(403);
  });

  it("quem não participa do evento recebe 404 e nada muda", async () => {
    const stranger = await t.login(app, "stranger");
    const res = await put(t.eventA.id, body(), { cookie: stranger });
    expect(res.status).toBe(404);
    const [ev] = await db.select().from(events).where(eq(events.id, t.eventA.id));
    expect(ev?.type).toBe("wedding");
  });
});

describe("PUT /config: validação", () => {
  it("tipo inválido, lados repetidos e lado vazio: 422", async () => {
    for (const bad of [
      body({ type: "festinha" }),
      body({
        sides: [
          { key: "a", label: "A" },
          { key: "a", label: "B" },
        ],
      }),
      body({ sides: [] }),
      body({ sides: [{ key: "Maiúscula", label: "X" }] }),
    ]) {
      const res = await put(t.eventA.id, bad);
      expect(res.status).toBe(422);
      expect(ApiError.safeParse(await res.json()).success).toBe(true);
    }
  });

  it("não tira um lado em uso e diz quantos convites usam", async () => {
    const [inv] = await db.insert(invitations).values({
      eventId: t.eventB.id,
      token: `tok-${t.run}-b`,
      label: "Convite do lado B",
      side: "familia",
      maxGuests: 2,
    });
    await db.insert(guests).values({
      eventId: t.eventB.id,
      invitationId: inv.insertId,
      name: "Convidado B",
    });
    await setEventSetting(
      db,
      t.eventB.id,
      "event.sides",
      [
        { key: "familia", label: "Família" },
        { key: "amigos", label: "Amigos" },
      ],
      false,
    );
    const ownerCookie = await t.login(app, "platformAdmin");
    const res = await put(t.eventB.id, body({ sides: [{ key: "amigos", label: "Amigos" }] }), {
      cookie: ownerCookie,
    });
    expect(res.status).toBe(422);
    const message = ApiError.parse(await res.json()).error.message;
    expect(message).toContain("1 convite usa");
    expect(message).toContain("Família");
    // Trocar só o rótulo (mesma chave) pode.
    const ok = await put(
      t.eventB.id,
      body({
        sides: [
          { key: "familia", label: "Família da debutante" },
          { key: "amigos", label: "Amigos" },
        ],
      }),
      { cookie: ownerCookie },
    );
    expect(ok.status).toBe(200);
  });
});

describe("PUT /config: efeitos", () => {
  it("grava tipo, módulos, lados e palavras; invalida o resolver e revalida só o evento", async () => {
    // Aquece o cache do resolver com o tipo antigo (rota pública).
    expect(
      SiteContent.parse(await (await app.request(`/api/e/${t.eventA.slug}/site`)).json()).event
        .type,
    ).toBe("wedding");
    revalidated.length = 0;

    const res = await put(t.eventA.id, body());
    expect(res.status).toBe(200);
    const json = (await res.json()) as ConfigJson;
    expect(json).toMatchObject({
      type: "fifteen",
      modules: { gifts: false, messages: true, godparents: false, rsvp: true },
      vocabulary: { hosts: "a debutante Lia", eventNoun: "festa de 15 anos" },
    });
    expect(revalidated).toEqual([{ eventId: t.eventA.id, tags: ["site", "gifts", "messages"] }]);

    // O site vê o tipo novo na hora (cache do resolver limpo) e o módulo desligado dá 404.
    const site = SiteContent.parse(
      await (await app.request(`/api/e/${t.eventA.slug}/site`)).json(),
    );
    expect(site.event.type).toBe("fifteen");
    expect(site.event.modules.gifts).toBe(false);
    expect(site.event.vocabulary.hosts).toBe("a debutante Lia");
    const gifts = await app.request(`/api/e/${t.eventA.slug}/gifts`, {
      headers: { "X-Web-Key": TEST_WEB_KEY },
    });
    expect(gifts.status).toBe(404);

    const [sides] = await db
      .select({ value: eventSettings.value, isPublic: eventSettings.isPublic })
      .from(eventSettings)
      .where(and(eq(eventSettings.eventId, t.eventA.id), eq(eventSettings.key, "event.sides")));
    expect(sides?.isPublic).toBe(false); // lados são privados
  });

  it("não mexe em outro evento (o rascunho da mesma organização)", async () => {
    const [other] = await db.select().from(events).where(eq(events.id, t.draftA.id));
    expect(other?.type).toBe("wedding");
    const rows = await db
      .select({ key: eventSettings.key })
      .from(eventSettings)
      .where(and(eq(eventSettings.eventId, t.draftA.id), eq(eventSettings.key, "event.modules")));
    expect(rows).toHaveLength(0);
  });

  it("GET devolve o que foi gravado", async () => {
    const res = await app.request(config(t.eventA.id), { headers: { cookie } });
    const json = (await res.json()) as ConfigJson;
    expect(json.sides.map((s) => s.key)).toEqual(["familia", "amigos"]);
    expect(json.vocabularyOverrides).toEqual({ hosts: "a debutante Lia" });
  });
});

describe("conteúdo legado", () => {
  it("o site.sections do casamento valida no contrato SiteSections", () => {
    const parsed = SiteSections.safeParse(
      legacySections((_file, alt = "", position = "") => ({ mediaId: 1, alt, position })),
    );
    expect(parsed.success).toBe(true);
  });
});
