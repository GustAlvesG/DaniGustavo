import { and, byEvent, eq, inArray, seatingTables, type Database } from "@casamento/db";
import {
  SeatAssignmentsInput,
  SeatingTableInput,
  SeatingTableOrder,
  SeatingTableUpdate,
} from "@casamento/shared";
import { Hono } from "hono";
import { ERROR_CODES, errorBody } from "../errors.ts";
import {
  applyAssignments,
  buildSeatingView,
  buildTableView,
  findTable,
  nextTableSort,
  SeatingConflict,
} from "../seating/service.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv, EventCtx } from "../tenancy/types.ts";
import { invalid, notFound, readJson, type AdminDeps } from "./context.ts";
import { eventSides } from "./event-config.ts";

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
  const { db } = deps;
  const app = new Hono<EventAdminEnv>();
  const one = "/tables/:tableId{[0-9]+}";

  /** O lado da mesa precisa existir em `event.sides` do evento. */
  async function sideError(ev: EventCtx, side: string | null | undefined) {
    if (!side) return null;
    const sides = await eventSides(ev, db as Database);
    return sides.some((s) => s.key === side)
      ? null
      : errorBody(ERROR_CODES.invalidRequest, "Esse lado não existe neste evento.", "side");
  }

  app.get("/", requirePermission("seating.read"), async (c) => {
    const ev = c.get("event");
    const view = await buildSeatingView(ev, db, await eventSides(ev, db), {
      all: c.req.query("all") === "1",
    });
    return c.json(view);
  });

  app.post("/tables", requirePermission("seating.write"), async (c) => {
    const ev = c.get("event");
    const parsed = SeatingTableInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const bad = await sideError(ev, parsed.data.side);
    if (bad) return c.json(bad, 422);
    const [res] = await db
      .insert(seatingTables)
      .values({ ...parsed.data, eventId: ev.id, sort: await nextTableSort(ev, db) });
    const table = await buildTableView(ev, db, await eventSides(ev, db), res.insertId);
    return c.json({ table }, 201);
  });

  // Antes de `one`: "order" não casa com o id numérico, mas fica explícito.
  app.put("/tables/order", requirePermission("seating.write"), async (c) => {
    const ev = c.get("event");
    const parsed = SeatingTableOrder.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const ids = parsed.data.ids;
    if (new Set(ids).size !== ids.length) {
      return c.json(errorBody(ERROR_CODES.invalidRequest, "Mesa repetida na ordem.", "ids"), 422);
    }
    if (ids.length > 0) {
      const found = await db
        .select({ id: seatingTables.id })
        .from(seatingTables)
        .where(and(byEvent(seatingTables, ev), inArray(seatingTables.id, ids)));
      if (found.length !== ids.length) return notFound(c, "Mesa");
    }
    await db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(seatingTables)
          .set({ sort: i })
          .where(and(byEvent(seatingTables, ev), eq(seatingTables.id, id)));
      }
    });
    return c.json({ ok: true });
  });

  app.patch(one, requirePermission("seating.write"), async (c) => {
    const ev = c.get("event");
    const id = Number(c.req.param("tableId"));
    const current = await findTable(ev, db, id);
    if (!current) return notFound(c, "Mesa");
    const parsed = SeatingTableUpdate.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const patch = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    );
    const bad = await sideError(ev, parsed.data.side);
    if (bad) return c.json(bad, 422);
    if (Object.keys(patch).length > 0) {
      await db
        .update(seatingTables)
        .set(patch)
        .where(and(byEvent(seatingTables, ev), eq(seatingTables.id, id)));
    }
    const table = await buildTableView(ev, db, await eventSides(ev, db), id);
    return c.json({ table });
  });

  app.delete(one, requirePermission("seating.write"), async (c) => {
    const ev = c.get("event");
    const id = Number(c.req.param("tableId"));
    if (!(await findTable(ev, db, id))) return notFound(c, "Mesa");
    // A FK composta apaga as atribuições em cascata: as pessoas voltam a "sem mesa".
    await db.delete(seatingTables).where(and(byEvent(seatingTables, ev), eq(seatingTables.id, id)));
    return c.json({ ok: true });
  });

  app.put("/assignments", requirePermission("seating.write"), async (c) => {
    const ev = c.get("event");
    const parsed = SeatAssignmentsInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    try {
      await applyAssignments(ev, db, parsed.data.assignments);
    } catch (err) {
      if (!(err instanceof SeatingConflict)) throw err;
      if (err.kind === "not_found") return notFound(c, err.message);
      if (err.kind === "conflict") {
        return c.json(errorBody(ERROR_CODES.conflict, err.message, err.field), 409);
      }
      return c.json(errorBody(ERROR_CODES.invalidRequest, err.message, err.field), 422);
    }
    return c.json(await buildSeatingView(ev, db, await eventSides(ev, db), { all: true }));
  });

  return app;
}
