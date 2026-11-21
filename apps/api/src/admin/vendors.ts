import { Hono } from "hono";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 4, frente B (docs/saas/fase-4.md): fornecedores do evento e contratos.
 *
 * /api/admin/events/:eventId/vendor-catalog (adminVendorCatalogRoutes)
 * - GET /  → { vendors: VendorRow[] } do catálogo da organização do evento (sem arquivados)
 *
 * /api/admin/events/:eventId/vendors (adminEventVendorRoutes)
 * - GET    /                                          → { vendors: EventVendorRow[] }
 * - POST   /                                          EventVendorInput → { vendor }
 * - PATCH  /:eventVendorId                            EventVendorUpdate → { vendor }
 * - DELETE /:eventVendorId                            → { ok } (orçamento contratado → 409)
 * - GET    /:eventVendorId/contracts                  → { contracts: ContractRow[] }
 * - POST   /:eventVendorId/contracts                  multipart (file + ContractMeta) → { contract }
 * - GET    /:eventVendorId/contracts/:contractId/file → o arquivo (Content-Disposition)
 * - DELETE /:eventVendorId/contracts/:contractId      → { ok }
 */
export function adminVendorCatalogRoutes(deps: AdminDeps) {
  void deps; // a frente usa db, storage etc.
  const app = new Hono<EventAdminEnv>();
  app.get("/", requirePermission("vendors.read"), (c) => notYet(c, "Catálogo de fornecedores"));
  return app;
}

export function adminEventVendorRoutes(deps: AdminDeps) {
  void deps; // a frente usa db, storage etc.
  const app = new Hono<EventAdminEnv>();
  const soon = "Fornecedores do evento";
  const one = "/:eventVendorId{[0-9]+}";
  const contract = `${one}/contracts/:contractId{[0-9]+}`;
  app.get("/", requirePermission("vendors.read"), (c) => notYet(c, soon));
  app.post("/", requirePermission("vendors.write"), (c) => notYet(c, soon));
  app.patch(one, requirePermission("vendors.write"), (c) => notYet(c, soon));
  app.delete(one, requirePermission("vendors.write"), (c) => notYet(c, soon));
  app.get(`${one}/contracts`, requirePermission("vendors.read"), (c) => notYet(c, soon));
  app.post(`${one}/contracts`, requirePermission("vendors.write"), (c) => notYet(c, soon));
  app.get(`${contract}/file`, requirePermission("vendors.read"), (c) => notYet(c, soon));
  app.delete(contract, requirePermission("vendors.write"), (c) => notYet(c, soon));
  return app;
}
