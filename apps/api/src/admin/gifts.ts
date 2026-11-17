import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  asc,
  count,
  eq,
  giftOrders,
  gifts,
  newPublicId,
  settings,
  sql,
  type Database,
} from "@casamento/db";
import {
  AdminGiftInput,
  ERROR_CODES,
  GiftOrderInput,
  UPLOAD_MAX_BYTES,
  type AdminGift,
  type GiftCategory,
} from "@casamento/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { apiError } from "../errors.ts";
import { invalid, notFound, readJson, sensitiveLimit } from "./context.ts";
import type { AdminDeps, AdminEnv } from "./context.ts";

/** "Jantar na lua de mel!" → "jantar-na-lua-de-mel" */
export function slugify(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "presente"
  );
}

async function uniqueSlug(db: Database, title: string, exceptId?: number): Promise<string> {
  const base = slugify(title);
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const [row] = await db.select({ id: gifts.id }).from(gifts).where(eq(gifts.slug, slug));
    if (!row || row.id === exceptId) return slug;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

async function listAdminGifts(db: Database): Promise<AdminGift[]> {
  const [rows, reserved, ordered] = await Promise.all([
    db.select().from(gifts).orderBy(asc(gifts.sort), asc(gifts.id)),
    db
      .select({ giftId: giftOrders.giftId, qty: sql<string>`SUM(${giftOrders.quantity})` })
      .from(giftOrders)
      .where(eq(giftOrders.status, "pending"))
      .groupBy(giftOrders.giftId),
    db
      .select({ giftId: giftOrders.giftId, n: count() })
      .from(giftOrders)
      .groupBy(giftOrders.giftId),
  ]);
  const reservedBy = new Map(reserved.map((r) => [r.giftId, Number(r.qty) || 0]));
  const withOrders = new Set(ordered.map((r) => r.giftId));
  return rows.map((g) => {
    const quotaReserved = g.openAmount ? 0 : (reservedBy.get(g.id) ?? 0);
    return {
      id: g.id,
      slug: g.slug,
      title: g.title,
      description: g.description,
      category: g.category,
      priceCents: g.priceCents,
      quotaTotal: g.quotaTotal,
      quotaPaid: g.openAmount ? 0 : Math.max(0, g.quotaSold - quotaReserved),
      quotaReserved,
      openAmount: g.openAmount,
      active: g.active,
      image: g.image,
      sort: g.sort,
      hasOrders: withOrders.has(g.id),
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Imagens                                                                   */
/* ------------------------------------------------------------------------ */

/** Tipo real pelo conteúdo (assinatura do arquivo), não pelo nome nem pelo navegador. */
export function sniffImage(bytes: Uint8Array): "jpg" | "png" | "webp" | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "jpg";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

const UPLOAD_FILE = /^[0-9A-Z]{26}\.(jpg|png|webp)$/;
const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

async function removeUpload(uploadDir: string, path: string | null) {
  const file = path?.replace(/^\/uploads\//, "");
  if (!file || !UPLOAD_FILE.test(file)) return;
  await unlink(join(uploadDir, file)).catch(() => undefined);
}

/** GET /uploads/:file — imagens públicas dos presentes (o site repassa via rewrite). */
export function uploadFileRoutes(uploadDir: string) {
  const app = new Hono();
  app.get("/uploads/:file", async (c) => {
    const file = c.req.param("file");
    const m = UPLOAD_FILE.exec(file);
    if (!m) return apiError(c, 404, ERROR_CODES.notFound, "Imagem não encontrada.");
    try {
      const data = await readFile(join(uploadDir, file));
      return c.body(data, 200, {
        "Content-Type": MIME[m[1] as keyof typeof MIME],
        "Cache-Control": "public, max-age=31536000, immutable",
      });
    } catch {
      return apiError(c, 404, ERROR_CODES.notFound, "Imagem não encontrada.");
    }
  });
  return app;
}

/* ------------------------------------------------------------------------ */
/* Rotas                                                                     */
/* ------------------------------------------------------------------------ */

export function adminGiftRoutes(deps: AdminDeps) {
  const { db, revalidate, uploadDir } = deps;
  const app = new Hono<AdminEnv>();
  const changed = () => revalidate(["gifts"]);

  app.get("/", async (c) => {
    const [list, [cats]] = await Promise.all([
      listAdminGifts(db),
      db.select().from(settings).where(eq(settings.key, "gifts.categories")),
    ]);
    return c.json({ gifts: list, categories: (cats?.value ?? []) as GiftCategory[] });
  });

  app.post("/", async (c) => {
    const parsed = AdminGiftInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const input = parsed.data;
    const [{ maxSort } = { maxSort: 0 }] = await db
      .select({ maxSort: sql<number>`COALESCE(MAX(${gifts.sort}), 0)` })
      .from(gifts);
    const [res] = await db.insert(gifts).values({
      ...input,
      slug: await uniqueSlug(db, input.title),
      tileDesign: "flor",
      sort: Number(maxSort) + 10,
    });
    await changed();
    const gift = (await listAdminGifts(db)).find((g) => g.id === res.insertId);
    return c.json({ gift }, 201);
  });

  app.put("/order", async (c) => {
    const parsed = GiftOrderInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    await db.transaction(async (tx) => {
      for (const [i, id] of parsed.data.ids.entries()) {
        await tx
          .update(gifts)
          .set({ sort: (i + 1) * 10 })
          .where(eq(gifts.id, id));
      }
    });
    await changed();
    return c.json({ gifts: await listAdminGifts(db) });
  });

  app.put("/:id{[0-9]+}", async (c) => {
    const id = Number(c.req.param("id"));
    const parsed = AdminGiftInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const input = parsed.data;
    const [current] = await db.select().from(gifts).where(eq(gifts.id, id));
    if (!current) return notFound(c, "Presente");
    if (!input.openAmount && input.quotaTotal < current.quotaSold) {
      return invalid(c, [
        {
          message: `Já há ${current.quotaSold} cotas vendidas ou reservadas: o total não pode ser menor.`,
        },
      ]);
    }
    await db
      .update(gifts)
      .set({
        ...input,
        slug: input.title === current.title ? current.slug : await uniqueSlug(db, input.title, id),
      })
      .where(eq(gifts.id, id));
    if (current.image !== input.image) await removeUpload(uploadDir, current.image);
    await changed();
    const gift = (await listAdminGifts(db)).find((g) => g.id === id);
    return c.json({ gift });
  });

  app.patch("/:id{[0-9]+}/active", async (c) => {
    const id = Number(c.req.param("id"));
    const body = (await readJson(c)) as { active?: unknown } | undefined;
    if (typeof body?.active !== "boolean") {
      return invalid(c, [{ message: "Informe active: true ou false." }]);
    }
    const [res] = await db.update(gifts).set({ active: body.active }).where(eq(gifts.id, id));
    if (res.affectedRows === 0) return notFound(c, "Presente");
    await changed();
    return c.json({ ok: true });
  });

  app.delete("/:id{[0-9]+}", async (c) => {
    const id = Number(c.req.param("id"));
    const [current] = await db.select().from(gifts).where(eq(gifts.id, id));
    if (!current) return notFound(c, "Presente");
    const [{ n } = { n: 0 }] = await db
      .select({ n: count() })
      .from(giftOrders)
      .where(eq(giftOrders.giftId, id));
    if (n > 0) {
      return apiError(
        c,
        409,
        ERROR_CODES.invalidRequest,
        "Este presente já tem pedidos e não pode ser excluído. Desative-o para tirá-lo da lista.",
      );
    }
    await db.delete(gifts).where(eq(gifts.id, id));
    await removeUpload(uploadDir, current.image);
    await changed();
    return c.json({ ok: true });
  });

  return app;
}

/** POST /api/admin/uploads — multipart com o campo "file" (JPG, PNG ou WebP até 2 MB). */
export function adminUploadRoutes(deps: AdminDeps) {
  const app = new Hono<AdminEnv>();
  const tooBig = `A imagem passa de ${UPLOAD_MAX_BYTES / 1024 / 1024} MB. Reduza o tamanho e envie de novo.`;
  app.post(
    "/",
    sensitiveLimit(deps.limiter, "upload"),
    bodyLimit({
      maxSize: UPLOAD_MAX_BYTES + 64 * 1024,
      onError: (c) => apiError(c, 413, ERROR_CODES.invalidRequest, tooBig),
    }),
    async (c) => {
      let file: unknown;
      try {
        file = (await c.req.parseBody())["file"];
      } catch {
        file = undefined;
      }
      if (!(file instanceof File)) {
        return invalid(c, [{ message: "Escolha uma imagem para enviar." }]);
      }
      if (file.size > UPLOAD_MAX_BYTES) return apiError(c, 413, ERROR_CODES.invalidRequest, tooBig);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = sniffImage(bytes);
      if (!ext) {
        return invalid(c, [{ message: "Formato não aceito: envie uma foto JPG, PNG ou WebP." }]);
      }
      const name = `${newPublicId()}.${ext}`;
      await mkdir(deps.uploadDir, { recursive: true });
      await writeFile(join(deps.uploadDir, name), bytes);
      return c.json({ path: `/uploads/${name}` }, 201);
    },
  );
  return app;
}
