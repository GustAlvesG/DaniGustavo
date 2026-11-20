import { EVENT_ACTIONS, type EventAccessView } from "@casamento/shared";
import { Hono } from "hono";
import { can } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";

/*
 * GET /api/admin/events/:eventId/access (Fase 3, frente C): papel e ações liberadas de quem está
 * logado neste evento, para o painel esconder o que não pode. Hoje só a matriz por papel;
 * TODO(fase3-C): descontar `event.host_permissions` quando o papel for event_host.
 */
export function adminEventAccessRoutes(deps: AdminDeps) {
  void deps; // a frente C lê event.host_permissions com deps.db
  const app = new Hono<EventAdminEnv>();
  app.get("/", (c) => {
    const role = c.get("eventRole");
    const body: EventAccessView = { role, allowed: EVENT_ACTIONS.filter((a) => can(role, a)) };
    return c.json(body);
  });
  return app;
}
