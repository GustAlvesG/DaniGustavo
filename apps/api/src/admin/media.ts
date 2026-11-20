import { asc, byEvent, eventMedia } from "@casamento/db";
import { mediaIdsIn, SiteSections, type AdminMedia } from "@casamento/shared";
import { Hono } from "hono";
import { apiError, ERROR_CODES } from "../errors.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { readSetting } from "./event-settings.ts";

/*
 * Fotos do evento (Fase 2, frente A): `/api/admin/events/:eventId/media`.
 *   GET    /            lista (ordem da galeria)
 *   POST   /            upload múltiplo (multipart: `file` + `thumb` por foto; ver MEDIA_* em shared)
 *   PATCH  /:id         alt, legenda, álbum, posição, na galeria
 *   PUT    /order       nova ordem
 *   DELETE /:id         apaga (recusa se a foto estiver em uso nas seções)
 * Arquivos pelo `deps.storage`; revalida as tags `site`.
 */
export function adminMediaRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<EventAdminEnv>();
  const todo = "Galeria ainda não disponível.";

  app.get("/", async (c) => {
    const ev = c.get("event");
    const [rows, stored] = await Promise.all([
      db
        .select()
        .from(eventMedia)
        .where(byEvent(eventMedia, ev))
        .orderBy(asc(eventMedia.sort), asc(eventMedia.id)),
      readSetting(ev, db, "site.sections"),
    ]);
    const parsed = SiteSections.safeParse(stored ?? {});
    const used = parsed.success ? mediaIdsIn(parsed.data) : [];
    const list: AdminMedia[] = rows.map((m) => ({
      id: m.id,
      url: deps.storage.url(ev.id, m.file),
      thumbUrl: m.thumbFile ? deps.storage.url(ev.id, m.thumbFile) : null,
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
    }));
    return c.json({ media: list });
  });

  // TODO(fase2-A): implementar (sniffImage pelos bytes, limites de MEDIA_*, Storage, ULID).
  const notYet = requirePermission("content.write");
  app.post("/", notYet, (c) => apiError(c, 501, ERROR_CODES.invalidRequest, todo));
  app.put("/order", notYet, (c) => apiError(c, 501, ERROR_CODES.invalidRequest, todo));
  app.patch("/:id{[0-9]+}", notYet, (c) => apiError(c, 501, ERROR_CODES.invalidRequest, todo));
  app.delete("/:id{[0-9]+}", notYet, (c) => apiError(c, 501, ERROR_CODES.invalidRequest, todo));

  return app;
}
