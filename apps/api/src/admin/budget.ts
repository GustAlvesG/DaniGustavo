import { Hono } from "hono";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 4, frente C (docs/saas/fase-4.md): orçamentos, parcelas e planejado × realizado.
 *
 * /api/admin/events/:eventId/quotes (adminQuoteRoutes)
 * - GET    /                       ?eventVendorId= → { quotes: QuoteSummary[] }
 * - POST   /                       QuoteInput → { quote: QuoteView }
 * - GET    /:quoteId               → { quote: QuoteView }
 * - PUT    /:quoteId               QuoteInput → { quote } (contratado → 409)
 * - DELETE /:quoteId               → { ok } (contratado → 409)
 * - POST   /:quoteId/status        QuoteStatusChange → { quote } (QUOTE_TRANSITIONS; 422)
 * - PUT    /:quoteId/installments  InstallmentPlan → { quote } (só contratado)
 *
 * /api/admin/events/:eventId/installments (adminInstallmentRoutes)
 * - PATCH  /:installmentId         InstallmentPayment → { installment: InstallmentRow }
 *
 * /api/admin/events/:eventId/budget (adminBudgetRoutes)
 * - GET /  → BudgetView
 * - PUT /  BudgetPlan → BudgetView
 */
export function adminQuoteRoutes(deps: AdminDeps) {
  void deps; // a frente usa db, storage etc.
  const app = new Hono<EventAdminEnv>();
  const soon = "Orçamentos";
  const one = "/:quoteId{[0-9]+}";
  app.get("/", requirePermission("budget.read"), (c) => notYet(c, soon));
  app.post("/", requirePermission("budget.write"), (c) => notYet(c, soon));
  app.get(one, requirePermission("budget.read"), (c) => notYet(c, soon));
  app.put(one, requirePermission("budget.write"), (c) => notYet(c, soon));
  app.delete(one, requirePermission("budget.write"), (c) => notYet(c, soon));
  app.post(`${one}/status`, requirePermission("budget.write"), (c) => notYet(c, soon));
  app.put(`${one}/installments`, requirePermission("budget.write"), (c) => notYet(c, soon));
  return app;
}

export function adminInstallmentRoutes(deps: AdminDeps) {
  void deps; // a frente usa db, storage etc.
  const app = new Hono<EventAdminEnv>();
  app.patch("/:installmentId{[0-9]+}", requirePermission("budget.write"), (c) =>
    notYet(c, "Parcelas"),
  );
  return app;
}

export function adminBudgetRoutes(deps: AdminDeps) {
  void deps; // a frente usa db, storage etc.
  const app = new Hono<EventAdminEnv>();
  app.get("/", requirePermission("budget.read"), (c) => notYet(c, "Financeiro"));
  app.put("/", requirePermission("budget.write"), (c) => notYet(c, "Financeiro"));
  return app;
}
