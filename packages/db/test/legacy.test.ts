import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, asc, count, eq } from "drizzle-orm";
import { DEFAULT_RETENTION_DAYS, PrivacySettings } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import { importLegacyContent, LEGACY_FOTOS_DIR, legacyFileName } from "../src/legacy/import.ts";
import { LEGACY_GALLERY, legacySections } from "../src/legacy/dani-gustavo.ts";
import { runMigrations } from "../src/migrate.ts";
import { resetDatabase } from "../src/reset.ts";
import { eventMedia, eventSettings } from "../src/schema/app.ts";
import { LEGACY_EVENT_ID } from "../src/schema/tenancy.ts";
import { seed } from "../src/seed.ts";
import { createTestDb } from "./helpers.ts";

// content:import-legacy: o conteúdo fixo do casamento vai para event_media e site.sections.

const uploadDir = mkdtempSync(join(tmpdir(), "casamento-legacy-"));
const STORAGE_FILE = /^[0-9A-Z]{26}\.(jpg|png|webp)$/;
let db: Database;

const setting = async (key: string) =>
  (
    await db
      .select({ value: eventSettings.value })
      .from(eventSettings)
      .where(and(eq(eventSettings.eventId, LEGACY_EVENT_ID), eq(eventSettings.key, key)))
  )[0]?.value as Record<string, any> | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeAll(async () => {
  db = await createTestDb();
  await resetDatabase(db);
  await runMigrations(db);
  // O seed já importa o conteúdo do casamento (primeira execução).
  await seed(db, { UPLOAD_DIR: uploadDir });
});

afterAll(async () => {
  rmSync(uploadDir, { recursive: true, force: true });
  await db?.$client.end();
});

describe("content:import-legacy", () => {
  it("traz todas as fotos para event_media, na ordem da galeria, e os arquivos para o Storage", async () => {
    const originals = readdirSync(LEGACY_FOTOS_DIR);
    expect(originals).toHaveLength(30);
    const media = await db
      .select()
      .from(eventMedia)
      .where(eq(eventMedia.eventId, LEGACY_EVENT_ID))
      .orderBy(asc(eventMedia.sort));
    expect(media).toHaveLength(30);
    for (const m of media) {
      expect(m.file).toMatch(STORAGE_FILE);
      expect(m.width).toBeGreaterThan(0);
      expect(m.height).toBeGreaterThan(0);
      expect(m.bytes).toBeGreaterThan(0);
      expect(existsSync(join(uploadDir, String(LEGACY_EVENT_ID), m.file))).toBe(true);
    }
    const gallery = media.filter((m) => m.inGallery);
    expect(gallery.map((m) => m.file)).toEqual(
      LEGACY_GALLERY.map((g) => legacyFileName(LEGACY_EVENT_ID, g.file)),
    );
    expect(gallery[0]!.alt).toBe(LEGACY_GALLERY[0]!.alt);
    expect(media.filter((m) => !m.inGallery)).toHaveLength(3);
  });

  it("grava site.sections com os textos e as fotos por id de event_media", async () => {
    const sections = await setting("site.sections");
    expect(sections?.hero.kicker).toBe("Vamos nos casar");
    expect(sections?.story.items).toHaveLength(5);
    expect(sections?.album.photos).toHaveLength(6);
    expect(sections?.verse.lines).toHaveLength(3);
    expect(sections?.footer.links.map((l: { link: string }) => l.link)).toContain("/padrinhos");
    expect(sections?.pages.gallery.soonNotice).toContain("pré-wedding");
    const ids = new Set((await db.select({ id: eventMedia.id }).from(eventMedia)).map((m) => m.id));
    const used: number[] = [];
    JSON.stringify(sections, (_k, v: unknown) => {
      if (v && typeof v === "object" && "mediaId" in v)
        used.push((v as { mediaId: number }).mediaId);
      return v;
    });
    expect(used.length).toBeGreaterThan(15);
    for (const id of used) expect(ids.has(id)).toBe(true);
  });

  it("remove as chaves antigas story.items e gallery.items", async () => {
    expect(await setting("story.items")).toBeUndefined();
    expect(await setting("gallery.items")).toBeUndefined();
    expect(await setting("gallery.official_soon")).toBe(true);
  });

  it("grava a arte do monograma e o UID da agenda como dados do evento", async () => {
    expect(await setting("couple.monogram_art")).toBe("dg");
    expect(await setting("calendar.uid")).toBe("casamento-20270410@dani-e-gustavo");
  });

  it("casamento sem exigir consentimento no RSVP/mural (só se a chave não existir)", async () => {
    expect(await setting("privacy.settings")).toEqual({
      requireConsent: false,
      contactEmail: null,
      retentionDays: DEFAULT_RETENTION_DAYS,
    });
    const edited = { requireConsent: true, contactEmail: null, retentionDays: 400 };
    await db
      .update(eventSettings)
      .set({ value: edited })
      .where(
        and(eq(eventSettings.eventId, LEGACY_EVENT_ID), eq(eventSettings.key, "privacy.settings")),
      );
    await importLegacyContent(db, { uploadDir });
    expect(await setting("privacy.settings")).toEqual(edited);
    await db
      .update(eventSettings)
      .set({ value: PrivacySettings.parse({ requireConsent: false }) })
      .where(
        and(eq(eventSettings.eventId, LEGACY_EVENT_ID), eq(eventSettings.key, "privacy.settings")),
      );
  });

  it("rodar de novo não duplica nada nem apaga o que o anfitrião editou", async () => {
    const before = await setting("site.sections");
    await db
      .update(eventSettings)
      .set({ value: { ...before, hero: { ...before!.hero, kicker: "Editado no painel" } } })
      .where(
        and(eq(eventSettings.eventId, LEGACY_EVENT_ID), eq(eventSettings.key, "site.sections")),
      );

    const again = await importLegacyContent(db, { uploadDir });
    expect(again).toMatchObject({
      mediaCreated: 0,
      mediaTotal: 30,
      filesCopied: 0,
      sectionsWritten: false,
      legacyKeysRemoved: 0,
    });
    const [n] = await db.select({ n: count() }).from(eventMedia);
    expect(n?.n).toBe(30);
    expect((await setting("site.sections"))?.hero.kicker).toBe("Editado no painel");
    expect(readdirSync(join(uploadDir, String(LEGACY_EVENT_ID)))).toHaveLength(30);
  });

  it("recupera arquivo apagado do Storage sem duplicar a linha", async () => {
    const dir = join(uploadDir, String(LEGACY_EVENT_ID));
    rmSync(join(dir, legacyFileName(LEGACY_EVENT_ID, "dsc06378.jpg")));
    const r = await importLegacyContent(db, { uploadDir });
    expect(r).toMatchObject({ mediaCreated: 0, filesCopied: 1 });
  });

  it("recusa evento sem conteúdo legado", async () => {
    await expect(importLegacyContent(db, { event: "outro", uploadDir })).rejects.toThrow(
      /conteúdo legado/,
    );
  });

  it("o conteúdo traduzido usa só fotos que existem (cada nome vira uma referência)", () => {
    const files: string[] = [];
    legacySections((file, alt = "", position = "") => {
      files.push(file);
      return { mediaId: 1, alt, position };
    });
    const originals = new Set(readdirSync(LEGACY_FOTOS_DIR));
    for (const f of files) expect(originals.has(f)).toBe(true);
  });
});
