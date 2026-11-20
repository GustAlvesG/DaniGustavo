import type { EventAccessView } from "@casamento/shared";
import { Hono } from "hono";
import { allowedActions, requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";

/*
 * GET /api/admin/events/:eventId/access (Fase 3): papel e ações liberadas de quem está logado
 * neste evento, para o painel esconder o que não pode. Para o anfitrião, já desconta
 * `event.host_permissions` (carregado pelo requireEventAccess). A API continua conferindo
 * cada ação com 403.
 */
export function adminEventAccessRoutes(deps: AdminDeps) {
  void deps; // o requireEventAccess já carregou o papel e a lista de negação
  const app = new Hono<EventAdminEnv>();
  app.get("/", requirePermission("dashboard.read"), (c) => {
    const role = c.get("eventRole");
    const body: EventAccessView = { role, allowed: allowedActions(role, c.get("hostDeny")) };
    return c.json(body);
  });
  return app;
}
