import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, inArray } from "drizzle-orm";
import { imageSize, PrivacySettings } from "@casamento/shared";
import type { Database } from "../client.ts";
import { eventMedia, eventSettings } from "../schema/app.ts";
import { events } from "../schema/tenancy.ts";
import {
  LEGACY_CALENDAR_UID,
  LEGACY_GALLERY,
  LEGACY_MONOGRAM_ART,
  legacySections,
  type PhotoOf,
} from "./dani-gustavo.ts";

/** Evento do casamento de Dani & Gustavo: o único que tem conteúdo legado. */
export const LEGACY_SLUG = "dani-gustavo";

/** Fotos do casamento versionadas no repositório (copiadas de apps/web/public/fotos). */
export const LEGACY_FOTOS_DIR = fileURLToPath(
  new URL("../../legacy/dani-gustavo/fotos", import.meta.url),
);

/** Pasta de uploads da API (UPLOAD_DIR do .env; padrão `apps/api/storage/uploads`). */
export const DEFAULT_UPLOAD_DIR = fileURLToPath(
  new URL("../../../../apps/api/storage/uploads", import.meta.url),
);

const MIME = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" } as const;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Nome estável no Storage (26 caracteres de ULID) derivado do nome original: rodar o importador
 * de novo cai nas mesmas linhas de `event_media` (único evento+arquivo) e nos mesmos arquivos.
 */
export function legacyFileName(eventId: number, original: string): string {
  const digest = createHash("sha1").update(`legacy:${eventId}:${original}`).digest();
  // 128 bits do hash, completados com zeros até 130 = 26 símbolos de 5 bits.
  const bits = [...digest.subarray(0, 16)].map((b) => b.toString(2).padStart(8, "0")).join("");
  const padded = bits.padEnd(130, "0");
  let id = "";
  for (let i = 0; i < 26; i++) id += CROCKFORD[parseInt(padded.slice(i * 5, i * 5 + 5), 2)];
  return `${id}${extname(original).toLowerCase()}`;
}

export interface LegacyImportOptions {
  /** Slug do evento (só `dani-gustavo` tem conteúdo legado). */
  event?: string;
  /** Pasta de uploads (a API serve `<uploadDir>/<eventId>/<arquivo>`). */
  uploadDir?: string;
  /** Pasta das fotos originais (padrão: packages/db/legacy/dani-gustavo/fotos). */
  fotosDir?: string;
}

export interface LegacyImportResult {
  eventId: number;
  mediaCreated: number;
  mediaTotal: number;
  filesCopied: number;
  /** false = o evento já tinha `site.sections` (editado no painel) e foi mantido. */
  sectionsWritten: boolean;
  /** Chaves antigas (`story.items`, `gallery.items`) removidas. */
  legacyKeysRemoved: number;
}

/**
 * Leva o conteúdo fixo do casamento para o banco: fotos em `event_media` (e os arquivos no
 * Storage local), `site.sections` com os textos de content/home.ts e paginas.ts, galeria pela
 * ordem de content/galeria.ts. Remove as chaves `story.items` e `gallery.items`.
 *
 * Grava também `couple.monogram_art` ("dg"), `calendar.uid` (o UID que a agenda já usava) e
 * `privacy.settings` com `requireConsent: false` (o RSVP do casamento não pedia consentimento).
 * Miniaturas (`thumb_file`) ficam nulas: gerá-las no servidor exigiria decodificar JPEG (sharp
 * ou similar, dependência nova); o site usa a foto inteira e o painel gera miniatura nos uploads.
 *
 * Idempotente e sem sobrescrever edição: fotos já importadas e `site.sections` existente ficam
 * como estão.
 */
export async function importLegacyContent(
  db: Database,
  options: LegacyImportOptions = {},
): Promise<LegacyImportResult> {
  const slug = options.event ?? LEGACY_SLUG;
  if (slug !== LEGACY_SLUG) {
    throw new Error(`Só o evento "${LEGACY_SLUG}" tem conteúdo legado para importar.`);
  }
  const uploadDir = options.uploadDir ?? DEFAULT_UPLOAD_DIR;
  const fotosDir = options.fotosDir ?? LEGACY_FOTOS_DIR;

  const [ev] = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug));
  if (!ev) throw new Error(`Evento "${slug}" não existe. Rode o seed ou o setup antes.`);

  let names: string[];
  try {
    names = (await readdir(fotosDir)).filter((f) => extname(f).toLowerCase() in MIME).sort();
  } catch {
    throw new Error(`Pasta das fotos não encontrada: ${fotosDir}.`);
  }

  // 1ª passada: quais fotos e com qual texto alternativo cada uma é usada nas seções.
  const firstAlt = new Map<string, string>();
  const collect: PhotoOf = (file, alt = "", position = "") => {
    if (!firstAlt.get(file)) firstAlt.set(file, alt);
    return { mediaId: 1, alt, position };
  };
  legacySections(collect);
  const galleryIndex = new Map(LEGACY_GALLERY.map((g, i) => [g.file, i]));
  const unknown = [...firstAlt.keys(), ...galleryIndex.keys()].filter((f) => !names.includes(f));
  if (unknown.length > 0) {
    throw new Error(`Fotos do conteúdo legado ausentes em ${fotosDir}: ${unknown.join(", ")}.`);
  }

  // Fotos: linha em `event_media` (insert ignore pelo único evento+arquivo) e arquivo no Storage.
  const targetDir = join(uploadDir, String(ev.id));
  let filesCopied = 0;
  const wanted = names.map((original) => ({
    original,
    file: legacyFileName(ev.id, original),
  }));
  const before = await db
    .select({ file: eventMedia.file })
    .from(eventMedia)
    .where(
      and(
        eq(eventMedia.eventId, ev.id),
        inArray(
          eventMedia.file,
          wanted.map((w) => w.file),
        ),
      ),
    );
  const existing = new Set(before.map((r) => r.file));
  let mediaCreated = 0;
  for (const [i, w] of wanted.entries()) {
    const source = join(fotosDir, w.original);
    const bytes = await readFile(source);
    const target = join(targetDir, w.file);
    const hasFile = await stat(target).then(
      () => true,
      () => false,
    );
    if (!hasFile) {
      await mkdir(targetDir, { recursive: true });
      await copyFile(source, target);
      filesCopied++;
    }
    if (existing.has(w.file)) continue;
    const size = imageSize(bytes);
    if (!size) throw new Error(`Foto "${basename(source)}": formato não reconhecido.`);
    const inGallery = galleryIndex.has(w.original);
    const [res] = await db
      .insert(eventMedia)
      .ignore()
      .values({
        eventId: ev.id,
        file: w.file,
        thumbFile: null,
        mime: MIME[extname(w.original).toLowerCase() as keyof typeof MIME],
        width: size.width,
        height: size.height,
        bytes: bytes.length,
        alt:
          LEGACY_GALLERY[galleryIndex.get(w.original) ?? -1]?.alt ?? firstAlt.get(w.original) ?? "",
        caption: "",
        album: null,
        position: null,
        inGallery,
        sort: inGallery ? galleryIndex.get(w.original)! * 10 : 1000 + i * 10,
      });
    mediaCreated += res.affectedRows;
  }

  const rows = await db
    .select({ id: eventMedia.id, file: eventMedia.file })
    .from(eventMedia)
    .where(
      and(
        eq(eventMedia.eventId, ev.id),
        inArray(
          eventMedia.file,
          wanted.map((w) => w.file),
        ),
      ),
    );
  const idByFile = new Map(rows.map((r) => [r.file, r.id]));
  const photo: PhotoOf = (original, alt = "", position = "") => {
    const id = idByFile.get(legacyFileName(ev.id, original));
    if (!id) throw new Error(`Foto "${original}" sem linha em event_media.`);
    return { mediaId: id, alt, position };
  };

  const [hasSections] = await db
    .select({ key: eventSettings.key })
    .from(eventSettings)
    .where(and(eq(eventSettings.eventId, ev.id), eq(eventSettings.key, "site.sections")));
  let sectionsWritten = false;
  if (!hasSections) {
    await db
      .insert(eventSettings)
      .ignore()
      .values({
        eventId: ev.id,
        key: "site.sections",
        value: legacySections(photo),
        isPublic: true,
      });
    sectionsWritten = true;
  }

  // Marca do evento que antes vinha do slug no código: arte DG do monograma e UID da agenda.
  await db
    .insert(eventSettings)
    .ignore()
    .values([
      { eventId: ev.id, key: "couple.monogram_art", value: LEGACY_MONOGRAM_ART, isPublic: true },
      { eventId: ev.id, key: "calendar.uid", value: LEGACY_CALENDAR_UID, isPublic: true },
    ]);

  // Fase 6: o casamento já recebia RSVP e recados sem a caixa de consentimento; ele continua
  // assim (os demais campos no padrão). Só grava se a chave não existir (o painel pode mudar).
  // Eventos novos não passam por aqui e seguem com o padrão `requireConsent: true`.
  await db
    .insert(eventSettings)
    .ignore()
    .values({
      eventId: ev.id,
      key: "privacy.settings",
      value: PrivacySettings.parse({ requireConsent: false }),
      isPublic: false,
    });

  const [removed] = await db
    .delete(eventSettings)
    .where(
      and(
        eq(eventSettings.eventId, ev.id),
        inArray(eventSettings.key, ["story.items", "gallery.items"]),
      ),
    );

  return {
    eventId: ev.id,
    mediaCreated,
    mediaTotal: rows.length,
    filesCopied,
    sectionsWritten,
    legacyKeysRemoved: removed.affectedRows,
  };
}
