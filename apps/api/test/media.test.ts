import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MEDIA_MAX_BYTES,
  MEDIA_MAX_FILES_PER_UPLOAD,
  SiteSections,
  type AdminMedia,
} from "@casamento/shared";
import type { CacheTag } from "../src/admin/index.ts";
import type { Mailer } from "../src/mailer.ts";
import { createTestEvents, testApp, type TestEvents } from "./helpers.ts";

// Frente A (Fase 2): upload, edição, ordem e exclusão de fotos do evento, com Storage em disco
// temporário e isolamento entre eventos. O evento B só tem o usuário "stranger" (dono da org B).

const mailer: Mailer = { send: () => Promise.resolve() };
const uploadDir = await mkdtemp(join(tmpdir(), "casamento-media-"));
const revalidated: { eventId: number; tags: CacheTag[] }[] = [];
const { app, db } = testApp(
  {
    mailer,
    revalidate: (eventId, tags) => {
      revalidated.push({ eventId, tags });
      return Promise.resolve();
    },
  },
  { UPLOAD_DIR: uploadDir },
);

/** PNG mínimo com IHDR de w×h (suficiente para a assinatura e o tamanho). */
function png(w: number, h: number, pad = 0): Uint8Array {
  const b = new Uint8Array(33 + pad);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
}
const blob = (b: Uint8Array, name: string) => new File([b], name, { type: "image/png" });

let t!: TestEvents;
let host = "";
let stranger = "";
type Ev = { id: number };
const url = (ev: Ev, path = "") => `/api/admin/events/${ev.id}/media${path}`;

function post(ev: Ev, form: FormData, cookie = host) {
  return app.request(url(ev), { method: "POST", headers: { cookie }, body: form });
}
async function upload(ev: Ev, n: number, cookie = host) {
  const form = new FormData();
  for (let i = 0; i < n; i++) {
    form.append("file", blob(png(800 + i, 600), `foto-${i}.png`));
    form.append("thumb", blob(png(320, 240), `foto-${i}-t.png`));
  }
  const res = await post(ev, form, cookie);
  return { res, media: ((await res.clone().json()) as { media?: AdminMedia[] }).media ?? [] };
}
const send = (ev: Ev, method: string, path: string, body: unknown, cookie = host) =>
  app.request(url(ev, path), {
    method,
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const del = (ev: Ev, id: number, cookie = host) =>
  app.request(url(ev, `/${id}`), { method: "DELETE", headers: { cookie } });

beforeAll(async () => {
  t = await createTestEvents(db);
  host = await t.login(app, "host");
  stranger = await t.login(app, "stranger");
});

afterAll(async () => {
  await t.cleanup();
  await db.$client.end();
  await rm(uploadDir, { recursive: true, force: true });
});

describe("upload", () => {
  it("grava foto e miniatura pelo Storage e lista na ordem", async () => {
    const { res, media } = await upload(t.eventA, 2);
    expect(res.status).toBe(201);
    expect(media).toHaveLength(2);
    expect(media[0]).toMatchObject({ width: 800, height: 600, inGallery: true });
    expect(media[0]!.url).toMatch(new RegExp(`^/uploads/${t.eventA.id}/[0-9A-Z]{26}\\.png$`));
    expect(media[0]!.thumbUrl).toMatch(/-t\.png$/);
    expect(media[1]!.sort).toBeGreaterThan(media[0]!.sort);
    expect((await readdir(join(uploadDir, String(t.eventA.id)))).length).toBeGreaterThanOrEqual(4);
    expect(revalidated.at(-1)).toEqual({ eventId: t.eventA.id, tags: ["site"] });
    const list = (await (
      await app.request(url(t.eventA), { headers: { cookie: host } })
    ).json()) as { media: AdminMedia[] };
    expect(list.media.map((m) => m.id)).toEqual(expect.arrayContaining(media.map((m) => m.id)));
  });

  it("aceita foto sem miniatura", async () => {
    const form = new FormData();
    form.append("file", blob(png(100, 100), "a.png"));
    const res = await post(t.eventA, form);
    expect(res.status).toBe(201);
    expect(((await res.json()) as { media: AdminMedia[] }).media[0]!.thumbUrl).toBeNull();
  });

  it("confere o tipo pelos bytes, não pelo nome", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(64).fill(7)], "fake.png", { type: "image/png" }));
    expect((await post(t.eventA, form)).status).toBe(422);
  });

  it("recusa foto grande demais, envio sem foto e excesso por envio", async () => {
    const big = new FormData();
    big.append("file", blob(png(10, 10, MEDIA_MAX_BYTES), "big.png"));
    expect((await post(t.eventA, big)).status).toBe(413);
    expect((await post(t.eventA, new FormData())).status).toBe(422);
    const many = new FormData();
    for (let i = 0; i <= MEDIA_MAX_FILES_PER_UPLOAD; i++) {
      many.append("file", blob(png(9, 9), "x.png"));
    }
    expect((await post(t.eventA, many)).status).toBe(422);
  });

  it("recusa miniatura que não casa com as fotos", async () => {
    const form = new FormData();
    form.append("file", blob(png(9, 9), "a.png"));
    form.append("file", blob(png(9, 9), "b.png"));
    form.append("thumb", blob(png(9, 9), "a-t.png"));
    expect((await post(t.eventA, form)).status).toBe(422);
  });

  it("quem não é do evento recebe 404", async () => {
    const form = new FormData();
    form.append("file", blob(png(9, 9), "a.png"));
    expect((await post(t.eventA, form, stranger)).status).toBe(404);
  });
});

describe("edição, ordem e exclusão", () => {
  it("PATCH atualiza legenda, álbum e galeria; valida o álbum", async () => {
    const { media } = await upload(t.eventA, 1);
    const id = media[0]!.id;
    const ok = await send(t.eventA, "PATCH", `/${id}`, {
      caption: "Dia 1",
      album: "pre-wedding",
      alt: "Casal",
      inGallery: false,
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { media: AdminMedia }).media).toMatchObject({
      caption: "Dia 1",
      album: "pre-wedding",
      alt: "Casal",
      inGallery: false,
    });
    expect((await send(t.eventA, "PATCH", `/${id}`, { album: "Com Espaço" })).status).toBe(422);
    const clear = await send(t.eventA, "PATCH", `/${id}`, { album: "" });
    expect(((await clear.json()) as { media: AdminMedia }).media.album).toBeNull();
  });

  it("PUT /order reordena e recusa foto de outro evento ou repetida", async () => {
    const a = (await upload(t.eventA, 3)).media;
    const b = (await upload(t.eventB, 1, stranger)).media;
    const ids = a.map((m) => m.id).reverse();
    const res = await send(t.eventA, "PUT", "/order", { ids });
    expect(res.status).toBe(200);
    const list = ((await res.json()) as { media: AdminMedia[] }).media;
    expect(list.filter((m) => ids.includes(m.id)).map((m) => m.id)).toEqual(ids);
    expect((await send(t.eventA, "PUT", "/order", { ids: [b[0]!.id] })).status).toBe(404);
    expect((await send(t.eventA, "PUT", "/order", { ids: [ids[0], ids[0]] })).status).toBe(422);
  });

  it("não mexe nem apaga foto de outro evento", async () => {
    const b = (await upload(t.eventB, 1, stranger)).media[0]!;
    expect((await send(t.eventA, "PATCH", `/${b.id}`, { caption: "x" })).status).toBe(404);
    expect((await del(t.eventA, b.id)).status).toBe(404);
    // E a foto continua lá, para o dono.
    const list = (await (
      await app.request(url(t.eventB), { headers: { cookie: stranger } })
    ).json()) as { media: AdminMedia[] };
    expect(list.media.some((m) => m.id === b.id)).toBe(true);
  });

  it("DELETE recusa foto em uso nas seções e apaga a que não está", async () => {
    const [used, free] = (await upload(t.eventA, 2)).media as [AdminMedia, AdminMedia];
    const sections = SiteSections.parse({ hero: { photoDesktop: { mediaId: used.id } } });
    const put = await app.request(`/api/admin/events/${t.eventA.id}/site`, {
      method: "PUT",
      headers: { cookie: host, "Content-Type": "application/json" },
      body: JSON.stringify({ sections }),
    });
    expect(put.status).toBe(200);
    expect((await del(t.eventA, used.id)).status).toBe(409);
    expect((await del(t.eventA, free.id)).status).toBe(200);
    const stem = free.url
      .split("/")
      .pop()!
      .replace(/\.\w+$/, "");
    const files = await readdir(join(uploadDir, String(t.eventA.id)));
    expect(files.some((f) => f.startsWith(stem))).toBe(false);
  });
});
