import { Hono } from "hono";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 4, frente D (docs/saas/fase-4.md): cronograma do dia, em
 * /api/admin/events/:eventId/schedule.
 *
 * - GET    /         → ScheduleView
 * - POST   /         ScheduleItemInput → { item: ScheduleItemRow }
 * - PATCH  /:itemId  ScheduleItemUpdate → { item }
 * - DELETE /:itemId  → { ok }
 */
export function adminScheduleRoutes(deps: AdminDeps) {
  void deps; // a frente usa db, storage etc.
  const app = new Hono<EventAdminEnv>();
  const soon = "Cronograma";
  app.get("/", requirePermission("schedule.read"), (c) => notYet(c, soon));
  app.post("/", requirePermission("schedule.write"), (c) => notYet(c, soon));
  app.patch("/:itemId{[0-9]+}", requirePermission("schedule.write"), (c) => notYet(c, soon));
  app.delete("/:itemId{[0-9]+}", requirePermission("schedule.write"), (c) => notYet(c, soon));
  return app;
}
