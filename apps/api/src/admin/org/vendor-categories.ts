import { Hono } from "hono";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import type { AdminDeps } from "../context.ts";
import { notYet } from "../stub.ts";

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
  void deps;
  const app = new Hono<OrgAdminEnv>();
  const soon = "Categorias de fornecedor";
  app.get("/", requireOrgPermission("org.read"), (c) => notYet(c, soon));
  app.post("/", requireOrgPermission("categories.manage"), (c) => notYet(c, soon));
  app.patch("/:categoryId{[0-9]+}", requireOrgPermission("categories.manage"), (c) =>
    notYet(c, soon),
  );
  return app;
}
