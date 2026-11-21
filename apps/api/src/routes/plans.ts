import type { Database } from "@casamento/db";
import { Hono } from "hono";
import { notYet } from "../admin/stub.ts";

/*
 * Fase 6, frente A: GET /api/plans (público; página de preços do site da plataforma) →
 * PublicPlansResponse (só `public` e `active`, por `sort`). Cache-Control curto.
 */
export function publicPlanRoutes(db: Database) {
  void db;
  const app = new Hono();
  app.get("/", (c) => notYet(c, "Planos"));
  return app;
}
