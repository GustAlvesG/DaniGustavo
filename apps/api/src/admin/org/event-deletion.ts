import { Hono } from "hono";
import type { OrgEventEnv } from "../../tenancy/org-access.ts";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import type { AdminDeps } from "../context.ts";
import { notYet } from "../stub.ts";

/*
 * Fase 6, frente C (docs/saas/fase-6.md §3 "Apagar evento"): em
 * /api/admin/orgs/:orgId/events/:eventId/deletion (depois de requireOrgEvent).
 *
 * - GET  /   → EventDeletionPreview                         (events.delete)
 * - POST /   EventDeletionInput → { ok: true }              (events.delete; slug diferente →
 *   422; evento não arquivado, pedido pendente ou pedido pago/reembolsado nos últimos
 *   EVENT_DELETION_ORDER_WINDOW_DAYS → 409 com o motivo). Em transação: grava o resumo em
 *   `event_deletions`, apaga payments/gift_orders (FK restrict) e o evento (cascata no resto);
 *   depois `storage.deleteEvent`, invalida o resolver e revalida o site.
 */
export function orgEventDeletionRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<OrgEventEnv>();
  const soon = "Apagar evento";
  app.get("/", requireOrgPermission("events.delete"), (c) => notYet(c, soon));
  app.post("/", requireOrgPermission("events.delete"), (c) => notYet(c, soon));
  return app;
}
