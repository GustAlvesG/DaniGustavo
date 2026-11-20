import {
  and,
  asc,
  byEvent,
  count,
  eq,
  eventMedia,
  inArray,
  newPublicId,
  sql,
  type Database,
} from "@casamento/db";
import {
  imageSize,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_FILES_PER_UPLOAD,
  MEDIA_MAX_PER_EVENT,
  MEDIA_THUMB_MAX_BYTES,
  mediaIdsIn,
  MediaReorder,
  MediaUpdate,
  SiteSections,
  type AdminMedia,
} from "@casamento/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { apiError, ERROR_CODES } from "../errors.ts";
import { STORAGE_MIME } from "../storage/index.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv, EventCtx } from "../tenancy/types.ts";
import { invalid, notFound, readJson, sensitiveLimit, type AdminDeps } from "./context.ts";
import { readSetting } from "./event-settings.ts";
import { sniffImage } from "./gifts.ts";

/*
 * Fotos do evento (Fase 2, frente A): `/api/admin/events/:eventId/media`.
 *   GET    /            lista (ordem da galeria)
 *   POST   /            upload múltiplo (multipart: `file` + `thumb` por foto; ver MEDIA_* em shared)
 *   PATCH  /:id         alt, legenda, álbum, posição, na galeria
 *   PUT    /order       nova ordem
 *   DELETE /:id         apaga (recusa se a foto estiver em uso nas seções)
 * Arquivos pelo `deps.storage`; revalida as tags `site`.
 */

type MediaRow = typeof eventMedia.$inferSelect;

/** Linhas do evento na ordem da galeria. */
async function listRows(ev: EventCtx, db: Database): Promise<MediaRow[]> {
  return db
    .select()
    .from(eventMedia)
    .where(byEvent(eventMedia, ev))
    .orderBy(asc(eventMedia.sort), asc(eventMedia.id));
}

async function usedIds(ev: EventCtx, db: Database): Promise<number[]> {
  const parsed = SiteSections.safeParse((await readSetting(ev, db, "site.sections")) ?? {});
  return parsed.success ? mediaIdsIn(parsed.data) : [];
}

const MB = 1024 * 1024;

type Ext = "jpg" | "png" | "webp";

interface Prepared {
  name: string;
  thumbName: string | null;
  bytes: Uint8Array;
  thumb: Uint8Array | null;
  ext: Ext;
  width: number;
  height: number;
}

export function adminMediaRoutes(deps: AdminDeps) {
  const { db, storage } = deps;
  const app = new Hono<EventAdminEnv>();

  const toAdmin = (ev: EventCtx, m: MediaRow, used: number[]): AdminMedia => ({
    id: m.id,
    url: storage.url(ev.id, m.file),
    thumbUrl: m.thumbFile ? storage.url(ev.id, m.thumbFile) : null,
    width: m.width,
    height: m.height,
    bytes: m.bytes,
    alt: m.alt,
    caption: m.caption,
    album: m.album,
    position: m.position,
    inGallery: m.inGallery,
    sort: m.sort,
    usedInSections: used.filter((id) => id === m.id).length,
    createdAt: m.createdAt.toISOString(),
  });

  app.get("/", requirePermission("content.read"), async (c) => {
    const ev = c.get("event");
    const [rows, used] = await Promise.all([listRows(ev, db), usedIds(ev, db)]);
    return c.json({ media: rows.map((m) => toAdmin(ev, m, used)) });
  });

  // Multipart: campos `file` (1 a 20) e, opcionalmente, `thumb` na mesma ordem.
  const tooBig = `Cada foto pode ter até ${MEDIA_MAX_BYTES / MB} MB. Reduza e envie de novo.`;
  app.post(
    "/",
    requirePermission("content.write"),
    sensitiveLimit(deps.limiter, "media-upload"),
    bodyLimit({
      maxSize: MEDIA_MAX_FILES_PER_UPLOAD * (MEDIA_MAX_BYTES + MEDIA_THUMB_MAX_BYTES + 4096),
      onError: (c) => apiError(c, 413, ERROR_CODES.invalidRequest, tooBig),
    }),
    async (c) => {
      const ev = c.get("event");
      let form: Record<string, unknown>;
      try {
        form = await c.req.parseBody({ all: true });
      } catch {
        form = {};
      }
      const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
      const files = list(form["file"]);
      const thumbs = list(form["thumb"]);
      if (!files.length || !files.every((f): f is File => f instanceof File)) {
        return invalid(c, [{ message: "Escolha as fotos para enviar." }]);
      }
      if (files.length > MEDIA_MAX_FILES_PER_UPLOAD) {
        return invalid(c, [{ message: `Envie até ${MEDIA_MAX_FILES_PER_UPLOAD} fotos por vez.` }]);
      }
      if (thumbs.length && thumbs.length !== files.length) {
        return invalid(c, [{ message: "Cada foto precisa da sua miniatura." }]);
      }
      const [counted] = await db
        .select({ n: count() })
        .from(eventMedia)
        .where(byEvent(eventMedia, ev));
      if (Number(counted?.n ?? 0) + files.length > MEDIA_MAX_PER_EVENT) {
        return invalid(c, [
          { message: `O evento comporta até ${MEDIA_MAX_PER_EVENT} fotos. Apague algumas antes.` },
        ]);
      }

      // Valida tudo antes de gravar qualquer coisa.
      const prepared: Prepared[] = [];
      for (const [i, file] of (files as File[]).entries()) {
        if (file.size > MEDIA_MAX_BYTES) {
          return apiError(c, 413, ERROR_CODES.invalidRequest, tooBig);
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const ext = sniffImage(bytes);
        const size = ext ? imageSize(bytes) : null;
        if (!ext || !size || size.width < 1 || size.height < 1) {
          return invalid(c, [
            { message: `"${file.name}": formato não aceito. Envie JPG, PNG ou WebP.` },
          ]);
        }
        let thumb: Uint8Array | null = null;
        let thumbExt: Ext | null = null;
        const t = thumbs[i];
        if (t !== undefined) {
          if (!(t instanceof File)) return invalid(c, [{ message: "Miniatura inválida." }]);
          if (t.size > MEDIA_THUMB_MAX_BYTES) {
            return invalid(c, [{ message: "A miniatura passa do tamanho permitido." }]);
          }
          thumb = new Uint8Array(await t.arrayBuffer());
          thumbExt = sniffImage(thumb);
          if (!thumbExt) return invalid(c, [{ message: "Miniatura em formato não aceito." }]);
        }
        const id = newPublicId();
        prepared.push({
          name: `${id}.${ext}`,
          thumbName: thumb && thumbExt ? `${id}-t.${thumbExt}` : null,
          bytes,
          thumb,
          ext,
          width: size.width,
          height: size.height,
        });
      }

      const written: string[] = [];
      try {
        for (const p of prepared) {
          await storage.put(ev.id, p.name, p.bytes);
          written.push(p.name);
          if (p.thumb && p.thumbName) {
            await storage.put(ev.id, p.thumbName, p.thumb);
            written.push(p.thumbName);
          }
        }
        const [top] = await db
          .select({ top: sql<number>`coalesce(max(${eventMedia.sort}), 0)` })
          .from(eventMedia)
          .where(byEvent(eventMedia, ev));
        const base = Number(top?.top ?? 0);
        await db.insert(eventMedia).values(
          prepared.map((p, i) => ({
            eventId: ev.id,
            file: p.name,
            thumbFile: p.thumbName,
            mime: STORAGE_MIME[p.ext],
            width: p.width,
            height: p.height,
            bytes: p.bytes.byteLength,
            sort: base + i + 1,
          })),
        );
      } catch (err) {
        await Promise.all(written.map((f) => storage.delete(ev.id, f)));
        throw err;
      }
      await deps.revalidate(ev.id, ["site"]);
      const rows = await db
        .select()
        .from(eventMedia)
        .where(
          and(
            byEvent(eventMedia, ev),
            inArray(
              eventMedia.file,
              prepared.map((p) => p.name),
            ),
          ),
        )
        .orderBy(asc(eventMedia.sort));
      return c.json({ media: rows.map((m) => toAdmin(ev, m, [])) }, 201);
    },
  );

  app.put("/order", requirePermission("content.write"), async (c) => {
    const ev = c.get("event");
    const parsed = MediaReorder.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const { ids } = parsed.data;
    if (new Set(ids).size !== ids.length) return invalid(c, [{ message: "Foto repetida." }]);
    const rows = await listRows(ev, db);
    const known = new Set(rows.map((r) => r.id));
    if (!ids.every((id) => known.has(id))) return notFound(c, "Foto");
    // Fotos fora da lista (ex.: só das seções) vão para depois, na ordem em que estavam.
    const rest = rows.map((r) => r.id).filter((id) => !ids.includes(id));
    await db.transaction(async (tx) => {
      for (const [i, id] of [...ids, ...rest].entries()) {
        await tx
          .update(eventMedia)
          .set({ sort: i + 1 })
          .where(and(eq(eventMedia.id, id), byEvent(eventMedia, ev)));
      }
    });
    await deps.revalidate(ev.id, ["site"]);
    const [fresh, used] = await Promise.all([listRows(ev, db), usedIds(ev, db)]);
    return c.json({ media: fresh.map((m) => toAdmin(ev, m, used)) });
  });

  app.patch("/:id{[0-9]+}", requirePermission("content.write"), async (c) => {
    const ev = c.get("event");
    const id = Number(c.req.param("id"));
    const parsed = MediaUpdate.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const changes = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    );
    const find = () =>
      db
        .select()
        .from(eventMedia)
        .where(and(eq(eventMedia.id, id), byEvent(eventMedia, ev)));
    if (!(await find())[0]) return notFound(c, "Foto");
    if (Object.keys(changes).length) {
      await db
        .update(eventMedia)
        .set({ ...changes, updatedAt: new Date() })
        .where(and(eq(eventMedia.id, id), byEvent(eventMedia, ev)));
      await deps.revalidate(ev.id, ["site"]);
    }
    const [row] = await find();
    return c.json({ media: toAdmin(ev, row!, await usedIds(ev, db)) });
  });

  app.delete("/:id{[0-9]+}", requirePermission("content.write"), async (c) => {
    const ev = c.get("event");
    const id = Number(c.req.param("id"));
    const [current] = await db
      .select()
      .from(eventMedia)
      .where(and(eq(eventMedia.id, id), byEvent(eventMedia, ev)));
    if (!current) return notFound(c, "Foto");
    if ((await usedIds(ev, db)).includes(id)) {
      return apiError(
        c,
        409,
        ERROR_CODES.invalidRequest,
        "Esta foto está em uso nas seções do site. Troque a foto lá antes de apagar.",
      );
    }
    await db.delete(eventMedia).where(and(eq(eventMedia.id, id), byEvent(eventMedia, ev)));
    await storage.delete(ev.id, current.file);
    if (current.thumbFile) await storage.delete(ev.id, current.thumbFile);
    await deps.revalidate(ev.id, ["site"]);
    return c.json({ ok: true });
  });

  return app;
}
