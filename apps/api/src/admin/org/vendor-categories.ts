import {
  and,
  asc,
  count,
  eq,
  events,
  inArray,
  isUniqueViolation,
  quotes,
  vendorCategories,
  vendors,
} from "@casamento/db";
import {
  VendorCategoryInput,
  VendorCategoryUpdate,
  type VendorCategoryView,
} from "@casamento/shared";
import { Hono } from "hono";
import { apiError, ERROR_CODES } from "../../errors.ts";
import { crossEvent } from "../../tenancy/cross-event.ts";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import { categoryKeyFromLabel, categoryOptions } from "../../vendors/categories.ts";
import { invalid, notFound, readJson, type AdminDeps } from "../context.ts";

/*
 * Fase 6, frente E (docs/saas/fase-6.md): categorias de fornecedor próprias da organização, em
 * /api/admin/orgs/:orgId/vendor-categories.
 *
 * - GET   /        → { categories: VendorCategoryView[], options: CategoryOption[] } (org.read)
 * - POST  /        VendorCategoryInput → { category } (categories.manage; chave `c-<slug>` do
 *   rótulo, repetida → 409)
 * - PATCH /:id     VendorCategoryUpdate → { category } (categories.manage; a chave não muda)
 * Sem DELETE: categoria em uso arquiva (como fornecedor).
 */
export function orgVendorCategoryRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<OrgAdminEnv>();
  const what = "Categoria";

  /** Uso por chave: fornecedores do catálogo + orçamentos dos eventos da organização. */
  async function usageOf(orgId: number, keys: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!keys.length) return out;
    const used = await db
      .select({ key: vendors.category, n: count() })
      .from(vendors)
      .where(and(eq(vendors.organizationId, orgId), inArray(vendors.category, keys)))
      .groupBy(vendors.category);
    const inQuotes = await crossEvent(
      "categorias da organização: orçamentos por categoria",
      async () =>
        await db
          .select({ key: quotes.category, n: count() })
          .from(quotes)
          .innerJoin(events, eq(events.id, quotes.eventId))
          .where(and(eq(events.organizationId, orgId), inArray(quotes.category, keys)))
          .groupBy(quotes.category),
    );
    for (const r of [...used, ...inQuotes]) out.set(r.key, (out.get(r.key) ?? 0) + Number(r.n));
    return out;
  }

  const view = (
    r: typeof vendorCategories.$inferSelect,
    usage: Map<string, number>,
  ): VendorCategoryView => ({
    id: r.id,
    key: r.key,
    label: r.label,
    sort: r.sort,
    archived: r.archivedAt !== null,
    usage: usage.get(r.key) ?? 0,
  });

  const findOne = async (orgId: number, id: number) => {
    const [row] = await db
      .select()
      .from(vendorCategories)
      .where(and(eq(vendorCategories.organizationId, orgId), eq(vendorCategories.id, id)));
    return row;
  };

  app.get("/", requireOrgPermission("org.read"), async (c) => {
    const org = c.get("org");
    const rows = await db
      .select()
      .from(vendorCategories)
      .where(eq(vendorCategories.organizationId, org.id))
      .orderBy(asc(vendorCategories.sort), asc(vendorCategories.label), asc(vendorCategories.id));
    const usage = await usageOf(
      org.id,
      rows.map((r) => r.key),
    );
    return c.json({
      categories: rows.map((r) => view(r, usage)),
      options: await categoryOptions(db, org.id),
    });
  });

  app.post("/", requireOrgPermission("categories.manage"), async (c) => {
    const org = c.get("org");
    const parsed = VendorCategoryInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const key = categoryKeyFromLabel(parsed.data.label);
    if (!key) return invalid(c, [{ message: "Use letras ou números no nome da categoria." }]);
    const now = new Date();
    try {
      const [res] = await db.insert(vendorCategories).values({
        organizationId: org.id,
        key,
        label: parsed.data.label,
        sort: parsed.data.sort,
        createdAt: now,
        updatedAt: now,
      });
      const row = (await findOne(org.id, res.insertId))!;
      return c.json({ category: view(row, new Map()) }, 201);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return apiError(c, 409, ERROR_CODES.conflict, "Já existe uma categoria com esse nome.");
      }
      throw err;
    }
  });

  app.patch("/:categoryId{[0-9]+}", requireOrgPermission("categories.manage"), async (c) => {
    const org = c.get("org");
    const id = Number(c.req.param("categoryId"));
    const parsed = VendorCategoryUpdate.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const current = await findOne(org.id, id);
    if (!current) return notFound(c, what);
    const { label, sort, archived } = parsed.data;
    await db
      .update(vendorCategories)
      .set({
        ...(label !== undefined ? { label } : {}),
        ...(sort !== undefined ? { sort } : {}),
        ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(vendorCategories.organizationId, org.id), eq(vendorCategories.id, id)));
    const row = (await findOne(org.id, id))!;
    return c.json({ category: view(row, await usageOf(org.id, [row.key])) });
  });

  return app;
}
