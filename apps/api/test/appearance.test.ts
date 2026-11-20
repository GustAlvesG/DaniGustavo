import { SiteContent, THEMES } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Mailer } from "../src/mailer.ts";
import { createTestEvents, setEventSetting, testApp, type TestEvents } from "./helpers.ts";

// Frente C (Fase 2): PUT /appearance escolhe tema, paleta e fontes prontos, por evento.

const mailer: Mailer = { send: () => Promise.resolve() };
const revalidate = vi.fn<(eventId: number, tags: string[]) => Promise<void>>(() =>
  Promise.resolve(),
);
const { app, db } = testApp({ mailer, revalidate });

let t!: TestEvents;
let host = "";
let stranger = "";

const url = (id: number) => `/api/admin/events/${id}/appearance`;
const put = (id: number, body: unknown, cookie = host, headers: Record<string, string> = {}) =>
  app.request(url(id), {
    method: "PUT",
    headers: { cookie, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  t = await createTestEvents(db);
  for (const ev of [t.eventA, t.eventB]) {
    await setEventSetting(db, ev.id, "couple.names", ev.name);
    await setEventSetting(db, ev.id, "couple.monogram", "EV");
    await setEventSetting(db, ev.id, "wedding.datetime", "2030-01-01T12:00:00-03:00");
    await setEventSetting(db, ev.id, "wedding.timezone", "America/Sao_Paulo");
  }
  host = await t.login(app, "host");
  stranger = await t.login(app, "stranger");
});

afterAll(async () => {
  await t.cleanup();
  await db.$client.end();
});

describe("PUT /appearance", () => {
  it("GET lista os temas e a escolha atual (padrão do tipo)", async () => {
    const res = await app.request(url(t.eventA.id), { headers: { cookie: host } });
    const body = (await res.json()) as {
      themes: { id: string }[];
      selection: unknown;
      resolved: { theme: string };
    };
    expect(body.themes.map((x) => x.id)).toEqual(Object.keys(THEMES));
    expect(body.selection).toBeNull();
    expect(body.resolved.theme).toBe("album");
  });

  it("grava, revalida só a tag do evento e o site passa a trazer o tema", async () => {
    revalidate.mockClear();
    const res = await put(t.eventA.id, {
      theme: "festa",
      palette: "lilas",
      fonts: { text: "playfair-display", script: "none" },
    });
    expect(res.status).toBe(200);
    expect(revalidate).toHaveBeenCalledExactlyOnceWith(t.eventA.id, ["site"]);
    const site = SiteContent.parse(
      await (await app.request(`/api/e/${t.eventA.slug}/site`)).json(),
    );
    expect(site.theme).toMatchObject({
      theme: "festa",
      palette: "lilas",
      fonts: { text: "playfair-display", ui: "nunito-sans", script: "none" },
    });
    // Outro evento não muda.
    const other = SiteContent.parse(
      await (await app.request(`/api/e/${t.eventB.slug}/site`)).json(),
    );
    expect(other.theme.theme).toBe("album");
  });

  it.each([
    ["paleta de outro tema", { theme: "festa", palette: "oceano" }],
    ["fonte fora do tema", { theme: "moderno", fonts: { text: "cormorant-garamond" } }],
    ["tema inexistente", { theme: "neon" }],
    ["cor livre não existe", { theme: "album", colors: { papel: "#000000" }, palette: 3 }],
  ])("recusa %s com 422 e não grava", async (_n, body) => {
    revalidate.mockClear();
    const before = await (
      await app.request(url(t.eventA.id), { headers: { cookie: host } })
    ).json();
    const res = await put(t.eventA.id, body);
    expect(res.status).toBe(422);
    expect(revalidate).not.toHaveBeenCalled();
    const after = await (await app.request(url(t.eventA.id), { headers: { cookie: host } })).json();
    expect(after).toEqual(before);
  });

  it("sem sessão 401, evento alheio 404 (e nada gravado), outra origem 403", async () => {
    expect((await put(t.eventB.id, { theme: "moderno" }, "")).status).toBe(401);
    expect((await put(t.eventB.id, { theme: "moderno" }, host)).status).toBe(404);
    expect((await put(t.eventA.id, { theme: "album" }, stranger)).status).toBe(404);
    const cross = await put(t.eventA.id, { theme: "album" }, host, {
      Origin: "https://site-malicioso.example",
    });
    expect(cross.status).toBe(403);
    const site = SiteContent.parse(
      await (await app.request(`/api/e/${t.eventB.slug}/site`)).json(),
    );
    expect(site.theme.theme).toBe("album");
  });
});
