import { Hono } from "hono";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import type { OrgAdminEnv } from "../../tenancy/types.ts";
import type { AdminDeps } from "../context.ts";
import { notYet } from "../stub.ts";

/*
 * Fase 4, frente B (docs/saas/fase-4.md): catálogo de fornecedores da organização, em
 * /api/admin/orgs/:orgId/vendors.
 *
 * - GET    /           ?archived=1&category= → { vendors: VendorRow[] }
 * - POST   /           VendorInput → { vendor: VendorRow }
 * - GET    /:vendorId  → { vendor: VendorRow, events: { id, name, status }[] }
 * - PATCH  /:vendorId  VendorUpdate → { vendor } (inclui arquivar)
 * - DELETE /:vendorId  → { ok } (em uso em algum evento → 409: arquive)
 */
export function orgVendorRoutes(deps: AdminDeps) {
  void deps; // a frente usa db, storage etc.
  const app = new Hono<OrgAdminEnv>();
  const soon = "Catálogo de fornecedores";
  const one = "/:vendorId{[0-9]+}";
  app.get("/", requireOrgPermission("org.read"), (c) => notYet(c, soon));
  app.post("/", requireOrgPermission("vendors.manage"), (c) => notYet(c, soon));
  app.get(one, requireOrgPermission("org.read"), (c) => notYet(c, soon));
  app.patch(one, requireOrgPermission("vendors.manage"), (c) => notYet(c, soon));
  app.delete(one, requireOrgPermission("vendors.manage"), (c) => notYet(c, soon));
  return app;
}
