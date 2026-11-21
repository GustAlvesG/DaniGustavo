import { Hono } from "hono";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 7, frente C (docs/saas/fase-7.md): links do portal do fornecedor no painel, em
 * /api/admin/events/:eventId/vendors/:eventVendorId/portal-links. Contratos em
 * @casamento/shared › vendor-portal.
 *
 * - GET  /                 → VendorPortalLinksResponse                          (vendors.read)
 * - POST /                 VendorPortalLinkInput → { link } e envia o e-mail com o link (token
 *   só em SHA-256; rate limit por usuário)                                     (vendors.portal)
 * - POST /:linkId/revoke   → { link }                                           (vendors.portal)
 */
export function adminVendorPortalRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<EventAdminEnv>();
  const soon = "Portal do fornecedor";
  const base = "/:eventVendorId{[0-9]+}/portal-links";
  app.get(base, requirePermission("vendors.read"), (c) => notYet(c, soon));
  app.post(base, requirePermission("vendors.portal"), (c) => notYet(c, soon));
  app.post(`${base}/:linkId{[0-9]+}/revoke`, requirePermission("vendors.portal"), (c) =>
    notYet(c, soon),
  );
  return app;
}
