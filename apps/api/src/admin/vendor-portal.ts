import { VendorPortalLinkInput, type VendorPortalLinkCreated } from "@casamento/shared";
import { Hono } from "hono";
import { ERROR_CODES, errorBody } from "../errors.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import {
  createLink,
  findEventVendor,
  listLinks,
  PortalLinkError,
  revokeLink,
} from "../vendor-portal/links.ts";
import { invalid, notFound, readJson, sensitiveLimit, type AdminDeps } from "./context.ts";

/*
 * Fase 7, frente C (docs/saas/fase-7.md): links do portal do fornecedor no painel, em
 * /api/admin/events/:eventId/vendors/:eventVendorId/portal-links. Contratos em
 * @casamento/shared › vendor-portal.
 *
 * - GET  /                 → VendorPortalLinksResponse                          (vendors.read)
 * - POST /                 VendorPortalLinkInput → VendorPortalLinkCreated e envia o e-mail
 *   com o link (token só em SHA-256; rate limit por usuário)                   (vendors.portal)
 * - POST /:linkId/revoke   → { link }                                           (vendors.portal)
 *
 * Fornecedor de outro evento → 404.
 */
export function adminVendorPortalRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<EventAdminEnv>();
  const base = "/:eventVendorId{[0-9]+}/portal-links";
  const vendorName = "Fornecedor";

  app.get(base, requirePermission("vendors.read"), async (c) => {
    const ev = c.get("event");
    const vendor = await findEventVendor(db, ev, Number(c.req.param("eventVendorId")));
    if (!vendor) return notFound(c, vendorName);
    return c.json({ links: await listLinks(db, ev, vendor.id, deps.now()) });
  });

  app.post(
    base,
    requirePermission("vendors.portal"),
    sensitiveLimit(deps.limiter, "vendor-portal-link"),
    async (c) => {
      const ev = c.get("event");
      const vendor = await findEventVendor(db, ev, Number(c.req.param("eventVendorId")));
      if (!vendor) return notFound(c, vendorName);
      const parsed = VendorPortalLinkInput.safeParse((await readJson(c)) ?? {});
      if (!parsed.success) return invalid(c, parsed.error.issues);
      try {
        const created = await createLink(
          { db, mailer: deps.mailer, authUrl: deps.env.BETTER_AUTH_URL },
          ev,
          vendor,
          parsed.data,
          c.get("user"),
          deps.now(),
        );
        return c.json(created satisfies VendorPortalLinkCreated, 201);
      } catch (err) {
        if (err instanceof PortalLinkError) {
          return c.json(errorBody(ERROR_CODES.invalidRequest, err.message, err.field), 422);
        }
        throw err;
      }
    },
  );

  app.post(`${base}/:linkId{[0-9]+}/revoke`, requirePermission("vendors.portal"), async (c) => {
    const link = await revokeLink(
      db,
      c.get("event"),
      Number(c.req.param("eventVendorId")),
      Number(c.req.param("linkId")),
      deps.now(),
    );
    if (!link) return notFound(c, "Link");
    return c.json({ link });
  });

  return app;
}
