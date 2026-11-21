import { Hono } from "hono";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 7, frente B (docs/saas/fase-7.md): mapa de mesas, em /api/admin/events/:eventId/seating.
 * Contratos em @casamento/shared › seating.
 *
 * - GET    /                   ?all=1 → SeatingView                          (seating.read)
 * - POST   /tables             SeatingTableInput → { table }                 (seating.write)
 * - PATCH  /tables/:tableId    SeatingTableUpdate → { table }                (seating.write)
 * - DELETE /tables/:tableId    → { ok } (as pessoas voltam para "sem mesa")  (seating.write)
 * - PUT    /tables/order       SeatingTableOrder → { ok }                    (seating.write)
 * - PUT    /assignments        SeatAssignmentsInput → SeatingView            (seating.write;
 *   pessoa e mesa do evento, senão 404; lugar repetido na mesa → 409)
 */
export function adminSeatingRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<EventAdminEnv>();
  const soon = "Mapa de mesas";
  const one = "/tables/:tableId{[0-9]+}";
  app.get("/", requirePermission("seating.read"), (c) => notYet(c, soon));
  app.post("/tables", requirePermission("seating.write"), (c) => notYet(c, soon));
  app.put("/tables/order", requirePermission("seating.write"), (c) => notYet(c, soon));
  app.patch(one, requirePermission("seating.write"), (c) => notYet(c, soon));
  app.delete(one, requirePermission("seating.write"), (c) => notYet(c, soon));
  app.put("/assignments", requirePermission("seating.write"), (c) => notYet(c, soon));
  return app;
}
