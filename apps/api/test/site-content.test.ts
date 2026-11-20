import { eventMedia } from "@casamento/db";
import { SiteContent } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mailer } from "../src/mailer.ts";
import { buildSiteContent, mediaPhoto, type MediaRow } from "../src/site-content.ts";
import type { EventCtx } from "../src/tenancy/types.ts";
import { createTestEvents, setEventSetting, testApp, type TestEvents } from "./helpers.ts";

// Conteúdo público do site (frente B): fotos das seções resolvidas por id de event_media,
// galeria = fotos marcadas para a galeria (com álbum e legenda), vocabulário e módulos do tipo.

const now = new Date("2026-11-20T12:00:00.000Z");
const row = (id: number, patch: Partial<MediaRow> = {}): MediaRow => ({
  id,
  eventId: 9,
  file: `f${id}.jpg`,
  thumbFile: `f${id}-t.jpg`,
  mime: "image/jpeg",
  width: 1600,
  height: 1200,
  bytes: 1000,
  alt: `Foto ${id}`,
  caption: "",
  album: null,
  position: null,
  inGallery: true,
  sort: id,
  createdAt: now,
  updatedAt: now,
  ...patch,
});

const basics = (extra: Record<string, unknown> = {}) =>
  new Map<string, unknown>(
    Object.entries({
      "couple.names": "Lia",
      "couple.monogram": "L",
      "wedding.datetime": "2030-05-01T20:00:00-03:00",
      "wedding.timezone": "America/Sao_Paulo",
      ...extra,
    }),
  );

describe("buildSiteContent", () => {
  it("resolve as fotos das seções (alt e posição do uso prevalecem) e tira as apagadas", () => {
    const media = [row(1, { position: "center 30%" }), row(2, { inGallery: false })];
    const site = buildSiteContent(
      basics({
        "site.sections": {
          hero: { photoDesktop: { mediaId: 1 }, photoMobile: { mediaId: 99 } },
          album: {
            photos: [
              { photo: { mediaId: 2, alt: "Abraço", position: "left top" }, caption: "Oi" },
              { photo: { mediaId: 98 }, caption: "Apagada" },
            ],
          },
        },
      }),
      { type: "fifteen", media },
    );
    expect(site.sections.hero.photoDesktop).toEqual({
      src: "/uploads/9/f1.jpg",
      thumbSrc: "/uploads/9/f1-t.jpg",
      width: 1600,
      height: 1200,
      alt: "Foto 1",
      position: "center 30%",
    });
    expect(site.sections.hero.photoMobile).toBeNull();
    expect(site.sections.album.photos).toEqual([
      {
        photo: expect.objectContaining({
          src: "/uploads/9/f2.jpg",
          alt: "Abraço",
          position: "left top",
        }),
        caption: "Oi",
      },
    ]);
  });

  it("galeria: só as fotos marcadas, com legenda e álbum, na ordem", () => {
    const media = [
      row(1, { album: "Festa", caption: "Bolo" }),
      row(2, { inGallery: false }),
      row(3, { album: null }),
    ];
    const site = buildSiteContent(basics({ "gallery.items": [] }), { type: "fifteen", media });
    expect(site.gallery.items.map((p) => [p.src, p.album, p.caption])).toEqual([
      ["/uploads/9/f1.jpg", "Festa", "Bolo"],
      ["/uploads/9/f3.jpg", null, ""],
    ]);
  });

  it("sem site.sections: seções neutras com o vocabulário e os módulos do tipo", () => {
    const site = buildSiteContent(basics({ "event.vocabulary": { heroKicker: "Meus quinze!" } }), {
      type: "fifteen",
    });
    expect(site.event.vocabulary.eventLabel).toBe("A festa");
    expect(site.sections.hero.kicker).toBe("Meus quinze!");
    expect(site.sections.event.menu).toBe("A festa");
    expect(site.event.modules.godparents).toBe(true);
    const birthday = buildSiteContent(basics(), { type: "birthday" });
    expect(birthday.event.modules.godparents).toBe(false);
    expect(JSON.stringify(birthday.sections)).not.toMatch(/casamento|noivos/i);
  });

  it("mediaPhoto usa a posição da foto quando o uso não tem", () => {
    expect(
      mediaPhoto(row(4, { position: "40% center", thumbFile: null }), { position: "" }),
    ).toMatchObject({
      thumbSrc: null,
      position: "40% center",
    });
  });
});

describe("GET /api/e/:slug/site com event_media", () => {
  const mailer: Mailer = { send: () => Promise.resolve() };
  const { app, db } = testApp({ mailer, revalidate: () => Promise.resolve() });
  const e = (ev: EventCtx, path: string) => `/api/e/${ev.slug}${path}`;
  let t!: TestEvents;

  beforeAll(async () => {
    t = await createTestEvents(db);
    for (const ev of [t.eventA, t.eventB]) {
      await setEventSetting(db, ev.id, "couple.names", ev.name);
      await setEventSetting(db, ev.id, "couple.monogram", "EV");
      await setEventSetting(db, ev.id, "wedding.datetime", "2030-01-01T12:00:00-03:00");
      await setEventSetting(db, ev.id, "wedding.timezone", "America/Sao_Paulo");
    }
  });

  afterAll(async () => {
    await t.cleanup();
    await db.$client.end();
  });

  it("resolve as fotos do próprio evento e ignora id de outro evento", async () => {
    const at = new Date();
    const media = (eventId: number, file: string, album: string | null) => ({
      eventId,
      file,
      mime: "image/jpeg",
      width: 800,
      height: 600,
      bytes: 10,
      alt: file,
      album,
      createdAt: at,
      updatedAt: at,
    });
    const [a] = await db.insert(eventMedia).values(media(t.eventA.id, "a.jpg", "Cerimônia"));
    const [b] = await db.insert(eventMedia).values(media(t.eventB.id, "b.jpg", null));
    await setEventSetting(db, t.eventA.id, "site.sections", {
      hero: { photoDesktop: { mediaId: a.insertId }, photoMobile: { mediaId: b.insertId } },
    });

    const res = await app.request(e(t.eventA, "/site"));
    expect(res.status).toBe(200);
    const site = SiteContent.parse(await res.json());
    expect(site.sections.hero.photoDesktop?.src).toBe(`/uploads/${t.eventA.id}/a.jpg`);
    // A foto do evento B não vaza para o A.
    expect(site.sections.hero.photoMobile).toBeNull();
    expect(site.gallery.items.map((p) => [p.src, p.album])).toEqual([
      [`/uploads/${t.eventA.id}/a.jpg`, "Cerimônia"],
    ]);

    const other = SiteContent.parse(await (await app.request(e(t.eventB, "/site"))).json());
    expect(other.gallery.items.map((p) => p.src)).toEqual([`/uploads/${t.eventB.id}/b.jpg`]);
  });
});
