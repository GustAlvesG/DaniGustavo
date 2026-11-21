import { AddEventDomainInput } from "@casamento/shared";
import { Hono, type Context } from "hono";
import {
  addCustomDomain,
  addPlatformDomain,
  DomainError,
  listDomains,
  makePrimary,
  removeDomain,
  verifyDomain,
  type DomainDeps,
} from "../../domains/service.ts";
import { apiError, ERROR_CODES, errorBody } from "../../errors.ts";
import type { OrgEventEnv } from "../../tenancy/org-access.ts";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import { resolverFor } from "../../tenancy/resolver.ts";
import { invalid, readJson, type AdminDeps } from "../context.ts";

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

const MINUTE = 60_000;
/** Checagens de DNS por domínio por minuto (cada uma é uma consulta externa). */
export const DOMAIN_VERIFY_LIMIT = 6;

export function orgEventDomainRoutes(deps: AdminDeps) {
  const app = new Hono<OrgEventEnv>();
  const one = "/:domainId{[0-9]+}";
  const domainDeps: DomainDeps = {
    db: deps.db,
    env: deps.env,
    resolver: resolverFor(deps.db, deps.eventResolver),
    revalidate: deps.revalidate,
    now: deps.now,
  };

  const handle = async (c: Context<OrgEventEnv>, fn: () => Promise<Response>) => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof DomainError) {
        const code =
          err.status === 404
            ? ERROR_CODES.notFound
            : err.status === 409
              ? ERROR_CODES.conflict
              : ERROR_CODES.invalidRequest;
        return c.json(errorBody(code, err.message, err.field), err.status);
      }
      throw err;
    }
  };
  const domainId = (c: Context<OrgEventEnv>) => Number(c.req.param("domainId"));

  app.get("/", requireOrgPermission("org.read"), async (c) =>
    c.json(await listDomains(deps.db, deps.env, c.get("event").id)),
  );

  app.post("/", requireOrgPermission("domains.manage"), (c) =>
    handle(c, async () => {
      const parsed = AddEventDomainInput.safeParse(await readJson(c));
      if (!parsed.success) return invalid(c, parsed.error.issues);
      const domain = await addCustomDomain(domainDeps, c.get("event"), parsed.data.host);
      return c.json({ domain }, 201);
    }),
  );

  app.post("/platform", requireOrgPermission("domains.manage"), (c) =>
    handle(c, async () => c.json({ domain: await addPlatformDomain(domainDeps, c.get("event")) })),
  );

  app.post(`${one}/verify`, requireOrgPermission("domains.manage"), (c) =>
    handle(c, async () => {
      const id = domainId(c);
      const r = deps.limiter.hit(`domain-verify:${id}`, DOMAIN_VERIFY_LIMIT, MINUTE);
      if (!r.allowed) {
        return apiError(
          c,
          429,
          ERROR_CODES.tooManyRequests,
          `Muitas verificações seguidas. Aguarde ${r.retryAfter} segundos (o DNS leva alguns minutos para atualizar).`,
          { "Retry-After": String(r.retryAfter) },
        );
      }
      return c.json({ domain: await verifyDomain(domainDeps, c.get("event"), id) });
    }),
  );

  app.post(`${one}/primary`, requireOrgPermission("domains.manage"), (c) =>
    handle(c, async () =>
      c.json({ domain: await makePrimary(domainDeps, c.get("event"), domainId(c)) }),
    ),
  );

  app.delete(one, requireOrgPermission("domains.manage"), (c) =>
    handle(c, async () => {
      await removeDomain(domainDeps, c.get("event"), domainId(c));
      return c.json({ ok: true });
    }),
  );
  return app;
}
