import { Hono } from "hono";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 7, frente D (docs/saas/fase-7.md): limite de convidados do plano com acompanhantes, em
 * /api/admin/events/:eventId/guest-limit.
 *
 * - GET / → GuestLimitStatus (dashboard.read; o início do painel mostra o aviso quando `over`)
 *
 * O aviso por e-mail sai do RSVP público (`routes/invitations.ts` chama
 * `plans/guest-overage.ts` › `notifyGuestOverage` depois de gravar), uma vez por estouro,
 * guardado em `event_settings` › `plan.guest_overage` (privada). O RSVP nunca é recusado.
 */
export function adminGuestLimitRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<EventAdminEnv>();
  app.get("/", requirePermission("dashboard.read"), (c) => notYet(c, "Limite de convidados"));
  return app;
}
