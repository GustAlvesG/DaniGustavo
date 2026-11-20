import { SiteContent } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mailer } from "../src/mailer.ts";
import type { EventCtx } from "../src/tenancy/types.ts";
import {
  createTestEvents,
  setEventSetting,
  TEST_WEB_KEY,
  testApp,
  type TestEvents,
} from "./helpers.ts";

// Fundação da Fase 2: o conteúdo público traz tipo, módulos, vocabulário, tema e seções; módulo
// desligado dá 404 nas rotas públicas; chaves com rota própria não passam pelo PUT genérico.

const mailer: Mailer = { send: () => Promise.resolve() };
const { app, db } = testApp({ mailer, revalidate: () => Promise.resolve() });
const e = (ev: EventCtx, path: string) => `/api/e/${ev.slug}${path}`;

let t!: TestEvents;
let cookie = "";

beforeAll(async () => {
  t = await createTestEvents(db);
  // O mínimo que todo evento tem (o event:create grava o mesmo).
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

describe("GET /api/e/:slug/site (Fase 2)", () => {
  it("evento sem nada gravado recebe o padrão do tipo", async () => {
    const res = await app.request(e(t.eventA, "/site"));
    expect(res.status).toBe(200);
    const site = SiteContent.parse(await res.json());
    expect(site.event.type).toBe("wedding");
    expect(site.event.vocabulary.eventLabel).toBe("O casamento");
    expect(site.event.modules).toMatchObject({ gifts: true, godparents: true });
    expect(site.theme).toMatchObject({ theme: "album", palette: "marinho" });
    expect(site.sections.hero.kicker).toBe("Vamos nos casar");
    expect(site.sections.hero.photoDesktop).toBeNull();
  });

  it("aplica vocabulário, tema e seções gravados", async () => {
    await setEventSetting(db, t.eventB.id, "event.vocabulary", { eventLabel: "A celebração" });
    await setEventSetting(db, t.eventB.id, "site.theme", { theme: "moderno", palette: "oceano" });
    await setEventSetting(db, t.eventB.id, "site.sections", { hero: { kicker: "Oi" } });
    const site = SiteContent.parse(await (await app.request(e(t.eventB, "/site"))).json());
    expect(site.event.vocabulary.eventLabel).toBe("A celebração");
    expect(site.theme).toMatchObject({ theme: "moderno", palette: "oceano" });
    expect(site.sections.hero.kicker).toBe("Oi");
    // O evento A não foi afetado.
    const a = SiteContent.parse(await (await app.request(e(t.eventA, "/site"))).json());
    expect(a.theme.theme).toBe("album");
  });
});

describe("módulos desligados", () => {
  it("presentes, recados e RSVP dão 404 só no evento que desligou", async () => {
    await setEventSetting(db, t.eventB.id, "event.modules", {
      gifts: false,
      messages: false,
      rsvp: false,
    });
    for (const path of ["/gifts", "/messages", "/invitations/xyz"]) {
      expect((await app.request(e(t.eventB, path))).status, path).toBe(404);
    }
    const order = await app.request(e(t.eventB, "/orders"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Web-Key": TEST_WEB_KEY },
      body: "{}",
    });
    expect(order.status).toBe(404);
    expect((await app.request(e(t.eventA, "/gifts"))).status).toBe(200);
    expect((await app.request(e(t.eventA, "/messages"))).status).toBe(200);
    const site = SiteContent.parse(await (await app.request(e(t.eventB, "/site"))).json());
    expect(site.event.modules).toMatchObject({ gifts: false, messages: false, gallery: true });
  });
});

describe("painel: rotas da Fase 2", () => {
  const admin = (path: string, init: RequestInit = {}) =>
    app.request(`/api/admin/events/${t.eventA.id}${path}`, {
      ...init,
      headers: { cookie, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });

  it("o PUT genérico de configurações recusa as chaves com página própria", async () => {
    const res = await admin("/settings", {
      method: "PUT",
      body: JSON.stringify({ values: { "site.theme": { theme: "festa" } } }),
    });
    expect(res.status).toBe(422);
  });

  it("GETs de site, mídia, aparência e configuração respondem", async () => {
    const site = (await (await admin("/site")).json()) as { isDefault: boolean };
    expect(site.isDefault).toBe(true);
    const media = (await (await admin("/media")).json()) as { media: unknown[] };
    expect(media.media).toEqual([]);
    const look = (await (await admin("/appearance")).json()) as { resolved: { theme: string } };
    expect(look.resolved.theme).toBe("album");
    const config = (await (await admin("/config")).json()) as {
      sides: { key: string }[];
      vocabulary: { eventLabel: string };
    };
    expect(config.sides.map((s) => s.key)).toEqual(["noiva", "noivo"]);
    expect(config.vocabulary.eventLabel).toBe("O casamento");
  });
});
