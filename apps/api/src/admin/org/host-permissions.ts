import {
  HOST_CONFIGURABLE_ACTIONS,
  HostPermissionsUpdate,
  withDependents,
  type HostPermissions,
  type HostPermissionsView,
} from "@casamento/shared";
import { Hono } from "hono";
import { requireOrgPermission, type OrgEventEnv } from "../../tenancy/org-access.ts";
import { HOST_PERMISSIONS_KEY, loadHostDeny } from "../../tenancy/permissions.ts";
import { invalid, readJson, type AdminDeps } from "../context.ts";
import { writeSetting } from "../event-settings.ts";

/*
 * Fase 3 (docs/saas/fase-3.md): permissões do anfitrião num evento, ajustadas pela organização.
 * Montado em /api/admin/orgs/:orgId/events/:eventId/host-permissions atrás de requireOrgEvent
 * (evento de outra organização → 404). Grava `event_settings` › `event.host_permissions`
 * (privado). O anfitrião não chega aqui (não entra no painel da organização) e o PUT
 * genérico de /settings do evento recusa a chave.
 *
 * - GET / → HostPermissionsView (lista de negação efetiva + ações configuráveis)
 * - PUT / → HostPermissionsUpdate; grava a lista já com as dependências (negar a leitura
 *   nega as escritas da mesma área) e devolve a HostPermissionsView.
 */
export function orgHostPermissionRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<OrgEventEnv>();
  const view = (eventId: number, deny: HostPermissionsView["deny"]): HostPermissionsView => ({
    eventId,
    deny,
    actions: HOST_CONFIGURABLE_ACTIONS,
  });

  app.get("/", requireOrgPermission("org.read"), async (c) => {
    const ev = c.get("event");
    return c.json(view(ev.id, await loadHostDeny(ev, db)));
  });

  app.put("/", requireOrgPermission("hosts.manage"), async (c) => {
    const ev = c.get("event");
    const body = HostPermissionsUpdate.safeParse(await readJson(c));
    if (!body.success) return invalid(c, body.error.issues);
    const value: HostPermissions = { deny: withDependents(body.data.deny) };
    await writeSetting(ev, db, HOST_PERMISSIONS_KEY, value, false);
    return c.json(view(ev.id, value.deny));
  });
  return app;
}
