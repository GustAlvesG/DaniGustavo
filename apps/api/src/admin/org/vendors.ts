import { and, asc, eq, isNull, vendors } from "@casamento/db";
import { VendorInput, VendorUpdate } from "@casamento/shared";
import { Hono } from "hono";
import { apiError, ERROR_CODES } from "../../errors.ts";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import { categoryProblem } from "../../vendors/categories.ts";
import {
  eventCounts,
  findVendor,
  INVALID_DOCUMENT,
  normalizeDocument,
  toVendorRow,
  vendorChanges,
  vendorEvents,
  vendorRow,
  vendorValues,
} from "../../vendors/service.ts";
import { invalid, notFound, readJson, type AdminDeps } from "../context.ts";

/*
 * Fase 4, frente B (docs/saas/fase-4.md): catálogo de fornecedores da organização, em
 * /api/admin/orgs/:orgId/vendors.
 *
 * - GET    /           ?archived=1&category= → { vendors: VendorRow[] } (archived=1 inclui os arquivados)
 * - POST   /           VendorInput → { vendor: VendorRow }
 * - GET    /:vendorId  → { vendor: VendorRow, events: { id, name, status }[] }
 * - PATCH  /:vendorId  VendorUpdate → { vendor } (inclui arquivar)
 * - DELETE /:vendorId  → { ok } (em uso em algum evento → 409: arquive)
 */
export function orgVendorRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<OrgAdminEnv>();
  const one = "/:vendorId{[0-9]+}";

  app.get("/", requireOrgPermission("org.read"), async (c) => {
    const org = c.get("org");
    const category = c.req.query("category");
    const rows = await db
      .select()
      .from(vendors)
      .where(
        and(
          eq(vendors.organizationId, org.id),
          c.req.query("archived") === "1" ? undefined : isNull(vendors.archivedAt),
          category ? eq(vendors.category, category) : undefined,
        ),
      )
      .orderBy(asc(vendors.name), asc(vendors.id));
    const counts = await eventCounts(
      db,
      org.id,
      rows.map((r) => r.id),
    );
    return c.json({ vendors: rows.map((r) => toVendorRow(r, counts.get(r.id) ?? 0)) });
  });

  app.post("/", requireOrgPermission("vendors.manage"), async (c) => {
    const org = c.get("org");
    const parsed = VendorInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const document = normalizeDocument(parsed.data.document);
    if (document === "invalid") return invalid(c, [{ message: INVALID_DOCUMENT }]);
    const bad = await categoryProblem(db, org.id, parsed.data.category);
    if (bad) return invalid(c, [{ message: bad }]);
    const [res] = await db
      .insert(vendors)
      .values({ organizationId: org.id, ...vendorValues(parsed.data, document) });
    return c.json({ vendor: await vendorRow(db, org.id, res.insertId) }, 201);
  });

  app.get(one, requireOrgPermission("org.read"), async (c) => {
    const org = c.get("org");
    const id = Number(c.req.param("vendorId"));
    const vendor = await vendorRow(db, org.id, id);
    if (!vendor) return notFound(c, "Fornecedor");
    return c.json({ vendor, events: await vendorEvents(db, org.id, id) });
  });

  app.patch(one, requireOrgPermission("vendors.manage"), async (c) => {
    const org = c.get("org");
    const id = Number(c.req.param("vendorId"));
    const raw = await readJson(c);
    const parsed = VendorUpdate.safeParse(raw);
    if (!parsed.success) return invalid(c, parsed.error.issues);
    if (!(await findVendor(db, org.id, id))) return notFound(c, "Fornecedor");
    const document =
      parsed.data.document === undefined ? undefined : normalizeDocument(parsed.data.document);
    if (document === "invalid") return invalid(c, [{ message: INVALID_DOCUMENT }]);
    const bad = await categoryProblem(db, org.id, parsed.data.category);
    if (bad) return invalid(c, [{ message: bad }]);
    const changes = vendorChanges(parsed.data, raw as Record<string, unknown>, document);
    if (Object.keys(changes).length) {
      await db
        .update(vendors)
        .set({ ...changes, updatedAt: new Date() })
        .where(and(eq(vendors.id, id), eq(vendors.organizationId, org.id)));
    }
    return c.json({ vendor: await vendorRow(db, org.id, id) });
  });

  app.delete(one, requireOrgPermission("vendors.manage"), async (c) => {
    const org = c.get("org");
    const id = Number(c.req.param("vendorId"));
    if (!(await findVendor(db, org.id, id))) return notFound(c, "Fornecedor");
    const inUse = "Este fornecedor está em eventos. Arquive-o em vez de apagar.";
    if ((await vendorEvents(db, org.id, id)).length) {
      return apiError(c, 409, ERROR_CODES.conflict, inUse);
    }
    try {
      await db.delete(vendors).where(and(eq(vendors.id, id), eq(vendors.organizationId, org.id)));
    } catch (err) {
      // Ligado a um evento entre a conferência e o delete: a FK (restrict) segura.
      if (/foreign key/i.test(String((err as Error).message + (err as Error).cause))) {
        return apiError(c, 409, ERROR_CODES.conflict, inUse);
      }
      throw err;
    }
    return c.json({ ok: true });
  });

  return app;
}
