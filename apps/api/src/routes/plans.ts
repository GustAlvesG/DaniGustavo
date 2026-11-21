import { and, asc, eq, plans, type Database } from "@casamento/db";
import type { PublicPlansResponse } from "@casamento/shared";
import { Hono } from "hono";
import { planView } from "../plans/service.ts";

/*
 * Fase 6, frente A: GET /api/plans (público; página de preços do site da plataforma) →
 * PublicPlansResponse (só `public` e `active`, por `sort`). Cache-Control curto.
 */
export function publicPlanRoutes(db: Database) {
  const app = new Hono();
  app.get("/", async (c) => {
    const rows = await db
      .select()
      .from(plans)
      .where(and(eq(plans.public, true), eq(plans.active, true)))
      .orderBy(asc(plans.sort), asc(plans.id));
    const body: PublicPlansResponse = { plans: rows.map(planView) };
    c.header("Cache-Control", "public, max-age=300");
    return c.json(body);
  });
  return app;
}
