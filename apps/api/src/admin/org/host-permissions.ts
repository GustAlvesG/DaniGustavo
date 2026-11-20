import { HOST_CONFIGURABLE_ACTIONS, type HostPermissionsView } from "@casamento/shared";
import { Hono } from "hono";
import { requireOrgPermission, type OrgEventEnv } from "../../tenancy/org-access.ts";
import type { AdminDeps } from "../context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 3, frente C (docs/saas/fase-3.md): permissões do anfitrião num evento. Montado em
 * /api/admin/orgs/:orgId/events/:eventId/host-permissions atrás de requireOrgEvent.
 * Grava `event_settings` › `event.host_permissions` (HostPermissions, privado).
 *
 * - GET / → HostPermissionsView + `actions` (ações configuráveis)
 * - PUT / → HostPermissionsUpdate
 */
export function orgHostPermissionRoutes(deps: AdminDeps) {
  void deps; // a frente usa deps (db, mailer, limiter...)
  const app = new Hono<OrgEventEnv>();
  // TODO(fase3-C): ler/gravar `event.host_permissions` e aplicar em requirePermission.
  app.get("/", requireOrgPermission("org.read"), (c) => {
    const view: HostPermissionsView = {
      eventId: c.get("event").id,
      deny: [],
      actions: HOST_CONFIGURABLE_ACTIONS,
    };
    return c.json(view);
  });
  app.put("/", requireOrgPermission("hosts.manage"), (c) => notYet(c, "Permissões do anfitrião"));
  return app;
}
