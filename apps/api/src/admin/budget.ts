import {
  BudgetPlan,
  ERROR_CODES,
  InstallmentPayment,
  InstallmentPlan,
  QuoteInput,
  QuoteStatusChange,
} from "@casamento/shared";
import { Hono, type Context } from "hono";
import type { z } from "zod";
import { errorBody } from "../errors.ts";
import {
  BudgetError,
  changeQuoteStatus,
  createQuote,
  deleteQuote,
  getBudget,
  getQuote,
  listQuotes,
  replanInstallments,
  saveBudgetPlan,
  setInstallmentPayment,
  updateQuote,
  type BudgetDeps,
} from "../budget/service.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import { invalid, readJson, type AdminDeps } from "./context.ts";

/*
 * Fase 4, frente C (docs/saas/fase-4.md): orçamentos, parcelas e planejado × realizado.
 * Regras em `../budget/service.ts`.
 *
 * /api/admin/events/:eventId/quotes (adminQuoteRoutes)
 * - GET    /                       ?eventVendorId= → { quotes: QuoteSummary[] }
 * - POST   /                       QuoteInput → { quote: QuoteView }
 * - GET    /:quoteId               → { quote: QuoteView }
 * - PUT    /:quoteId               QuoteInput → { quote } (contratado → 409)
 * - DELETE /:quoteId               → { ok } (contratado → 409)
 * - POST   /:quoteId/status        QuoteStatusChange → { quote } (QUOTE_TRANSITIONS; 422)
 * - PUT    /:quoteId/installments  InstallmentPlan → { quote } (só contratado; pagas ficam)
 *
 * /api/admin/events/:eventId/installments (adminInstallmentRoutes)
 * - PATCH  /:installmentId         InstallmentPayment → { installment: InstallmentRow }
 *
 * /api/admin/events/:eventId/budget (adminBudgetRoutes)
 * - GET /  → BudgetView
 * - PUT /  BudgetPlan → BudgetView
 */

const budgetDeps = (deps: AdminDeps): BudgetDeps => ({ db: deps.db });

/** Converte BudgetError em resposta; o resto sobe para o tratador de erros da API. */
async function handle(c: Context, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof BudgetError)) throw err;
    const code =
      err.status === 404
        ? ERROR_CODES.notFound
        : err.status === 409
          ? ERROR_CODES.conflict
          : ERROR_CODES.invalidRequest;
    return c.json(errorBody(code, err.message, err.field), err.status);
  }
}

type Parsed<T> = { ok: true; data: T } | { ok: false; res: Response };

/** Corpo validado pelo schema ou a resposta 422. */
async function body<S extends z.ZodType>(c: Context, schema: S): Promise<Parsed<z.output<S>>> {
  const parsed = schema.safeParse(await readJson(c));
  if (!parsed.success) return { ok: false, res: invalid(c, parsed.error.issues) };
  return { ok: true, data: parsed.data };
}

export function adminQuoteRoutes(deps: AdminDeps) {
  const bd = budgetDeps(deps);
  const app = new Hono<EventAdminEnv>();
  const one = "/:quoteId{[0-9]+}";
  const quoteId = (c: Context) => Number(c.req.param("quoteId"));

  app.get("/", requirePermission("budget.read"), async (c) => {
    const raw = c.req.query("eventVendorId");
    const eventVendorId = raw && /^\d{1,15}$/.test(raw) ? Number(raw) : undefined;
    if (raw && eventVendorId === undefined) {
      return invalid(c, [{ message: "Fornecedor inválido." }]);
    }
    return c.json({ quotes: await listQuotes(bd, c.get("event"), { eventVendorId }) });
  });

  app.post("/", requirePermission("budget.write"), (c) =>
    handle(c, async () => {
      const b = await body(c, QuoteInput);
      if (!b.ok) return b.res;
      return c.json({ quote: await createQuote(bd, c.get("event"), b.data) }, 201);
    }),
  );

  app.get(one, requirePermission("budget.read"), (c) =>
    handle(c, async () => c.json({ quote: await getQuote(bd, c.get("event"), quoteId(c)) })),
  );

  app.put(one, requirePermission("budget.write"), (c) =>
    handle(c, async () => {
      const b = await body(c, QuoteInput);
      if (!b.ok) return b.res;
      return c.json({ quote: await updateQuote(bd, c.get("event"), quoteId(c), b.data) });
    }),
  );

  app.delete(one, requirePermission("budget.write"), (c) =>
    handle(c, async () => {
      await deleteQuote(bd, c.get("event"), quoteId(c));
      return c.json({ ok: true });
    }),
  );

  app.post(`${one}/status`, requirePermission("budget.write"), (c) =>
    handle(c, async () => {
      const b = await body(c, QuoteStatusChange);
      if (!b.ok) return b.res;
      return c.json({ quote: await changeQuoteStatus(bd, c.get("event"), quoteId(c), b.data) });
    }),
  );

  app.put(`${one}/installments`, requirePermission("budget.write"), (c) =>
    handle(c, async () => {
      const b = await body(c, InstallmentPlan);
      if (!b.ok) return b.res;
      const quote = await replanInstallments(bd, c.get("event"), quoteId(c), b.data.installments);
      return c.json({ quote });
    }),
  );

  return app;
}

export function adminInstallmentRoutes(deps: AdminDeps) {
  const bd = budgetDeps(deps);
  const app = new Hono<EventAdminEnv>();
  app.patch("/:installmentId{[0-9]+}", requirePermission("budget.write"), (c) =>
    handle(c, async () => {
      const b = await body(c, InstallmentPayment);
      if (!b.ok) return b.res;
      const id = Number(c.req.param("installmentId"));
      return c.json({ installment: await setInstallmentPayment(bd, c.get("event"), id, b.data) });
    }),
  );
  return app;
}

export function adminBudgetRoutes(deps: AdminDeps) {
  const bd = budgetDeps(deps);
  const app = new Hono<EventAdminEnv>();
  app.get("/", requirePermission("budget.read"), async (c) =>
    c.json(await getBudget(bd, c.get("event"))),
  );
  app.put("/", requirePermission("budget.write"), async (c) => {
    const b = await body(c, BudgetPlan);
    if (!b.ok) return b.res;
    return c.json(await saveBudgetPlan(bd, c.get("event"), b.data));
  });
  return app;
}
