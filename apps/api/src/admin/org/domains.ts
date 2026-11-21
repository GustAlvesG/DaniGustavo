import { Hono } from "hono";
import type { OrgEventEnv } from "../../tenancy/org-access.ts";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import type { AdminDeps } from "../context.ts";
import { notYet } from "../stub.ts";

/*
 * Fase 6, frente B (docs/saas/fase-6.md): domínios de um evento, em
 * /api/admin/orgs/:orgId/events/:eventId/domains (depois de requireOrgEvent).
 *
 * - GET    /                     → EventDomainsResponse            (org.read)
 * - POST   /                     AddEventDomainInput → { domain }  (domains.manage; nasce não
 *   verificado, com `verification_token`; host já usado → 409)
 * - POST   /platform             → { domain } cria `<slug>.<PLATFORM_BASE_DOMAIN>` (domains.manage;
 *   sem base → 422)
 * - POST   /:domainId/verify     → { domain } confere o TXT por `dns.promises` (domains.manage;
 *   rate limit)
 * - POST   /:domainId/primary    → { domain } (domains.manage; só verificado)
 * - DELETE /:domainId            → { ok } (domains.manage; o primário só sai se houver outro)
 * Toda mudança invalida o resolver e revalida o site do evento.
 */
export function orgEventDomainRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<OrgEventEnv>();
  const soon = "Domínios";
  const one = "/:domainId{[0-9]+}";
  app.get("/", requireOrgPermission("org.read"), (c) => notYet(c, soon));
  app.post("/", requireOrgPermission("domains.manage"), (c) => notYet(c, soon));
  app.post("/platform", requireOrgPermission("domains.manage"), (c) => notYet(c, soon));
  app.post(`${one}/verify`, requireOrgPermission("domains.manage"), (c) => notYet(c, soon));
  app.post(`${one}/primary`, requireOrgPermission("domains.manage"), (c) => notYet(c, soon));
  app.delete(one, requireOrgPermission("domains.manage"), (c) => notYet(c, soon));
  return app;
}
