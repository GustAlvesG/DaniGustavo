import {
  and,
  asc,
  budgetLines,
  byEvent,
  desc,
  eq,
  eventVendors,
  isNotNull,
  isNull,
  quoteInstallments,
  quoteItems,
  quotes,
  sql,
  vendors,
  type Database,
  type SQL,
} from "@casamento/db";
import {
  CENTS_MAX,
  isCalendarDate,
  localDateTimeToIso,
  QUOTE_STATUS_LABELS,
  QUOTE_TRANSITIONS,
  quoteItemTotal,
  quoteSubtotal,
  VENDOR_CATEGORIES,
  type BudgetCategoryRow,
  type BudgetPlan,
  type BudgetView,
  type InstallmentInput,
  type InstallmentPayment,
  type InstallmentRow,
  type QuoteInput,
  type QuoteStatus,
  type QuoteStatusChange,
  type QuoteSummary,
  type QuoteView,
  type VendorCategory,
} from "@casamento/shared";
import type { EventCtx } from "../tenancy/types.ts";
import { categoriesProblem } from "../vendors/categories.ts";

/*
 * Fase 4, frente C: orçamentos, parcelas e planejado × realizado. Todo acesso filtra pelo
 * evento (`byEvent`); o nome do fornecedor vem do catálogo da organização pelo par
 * (organization_id, vendor_id) de `event_vendors`.
 */

/** Erro de regra de negócio: a rota converte em 404/409/422 com a mensagem pt-BR. */
export class BudgetError extends Error {
  readonly status: 404 | 409 | 422;
  readonly field: string | undefined;
  constructor(status: 404 | 409 | 422, message: string, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

const notFound = (what = "Orçamento") => new BudgetError(404, `${what} não encontrado.`);
const unprocessable = (message: string, field?: string) => new BudgetError(422, message, field);

export interface BudgetDeps {
  db: Database;
  now?: () => Date;
}

const nowOf = (deps: BudgetDeps) => (deps.now ?? (() => new Date()))();

/** "AAAA-MM-DD" de um instante no fuso do evento. */
export function localDate(instant: Date, timeZone: string): string {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Pagamento informado como data: guardamos o meio-dia local (não vira o dia anterior em UTC). */
const paidOnToInstant = (paidOn: string, timeZone: string) =>
  new Date(localDateTimeToIso(paidOn, "12:00", timeZone));

/** Total = Σ(qtd × unitário) − desconto; desconto maior que a soma → 422. */
export function computeQuoteTotal(input: Pick<QuoteInput, "items" | "discountCents">): number {
  const subtotal = quoteSubtotal(input.items);
  if (subtotal > CENTS_MAX) throw unprocessable("Valor alto demais para um orçamento.", "items");
  if (input.discountCents > subtotal) {
    throw unprocessable("O desconto não pode ser maior que a soma dos itens.", "discountCents");
  }
  return subtotal - input.discountCents;
}

function checkDates(installments: InstallmentInput[]) {
  for (const it of installments) {
    if (!isCalendarDate(it.dueOn)) throw unprocessable("Data de vencimento inválida.", "dueOn");
  }
}

/* ------------------------------------------------------------------------ */
/* Leitura                                                                   */
/* ------------------------------------------------------------------------ */

const quoteColumns = {
  id: quotes.id,
  eventVendorId: quotes.eventVendorId,
  vendorName: vendors.name,
  vendorStatus: eventVendors.status,
  title: quotes.title,
  category: quotes.category,
  status: quotes.status,
  totalCents: quotes.totalCents,
  discountCents: quotes.discountCents,
  validUntil: quotes.validUntil,
  notes: quotes.notes,
  updatedAt: quotes.updatedAt,
  source: quotes.source,
};

/** quotes ⨝ event_vendors ⨝ vendors, sempre com as colunas de escopo das três. */
function quoteQuery(db: Database, ev: EventCtx, extra?: SQL) {
  return db
    .select(quoteColumns)
    .from(quotes)
    .innerJoin(
      eventVendors,
      and(eq(eventVendors.eventId, quotes.eventId), eq(eventVendors.id, quotes.eventVendorId)),
    )
    .innerJoin(
      vendors,
      and(
        eq(vendors.organizationId, eventVendors.organizationId),
        eq(vendors.id, eventVendors.vendorId),
      ),
    )
    .where(and(byEvent(quotes, ev), byEvent(eventVendors, ev), extra));
}

type QuoteRecord = Awaited<ReturnType<typeof quoteQuery>>[number];

async function paidByQuote(db: Database, ev: EventCtx, quoteId?: number) {
  const rows = await db
    .select({
      quoteId: quoteInstallments.quoteId,
      paid: sql<string>`COALESCE(SUM(${quoteInstallments.amountCents}), 0)`,
    })
    .from(quoteInstallments)
    .where(
      and(
        byEvent(quoteInstallments, ev),
        isNotNull(quoteInstallments.paidAt),
        quoteId === undefined ? undefined : eq(quoteInstallments.quoteId, quoteId),
      ),
    )
    .groupBy(quoteInstallments.quoteId);
  return new Map(rows.map((r) => [r.quoteId, Number(r.paid) || 0]));
}

function toSummary(q: QuoteRecord, paid: Map<number, number>): QuoteSummary {
  return {
    id: q.id,
    eventVendorId: q.eventVendorId,
    vendorName: q.vendorName,
    vendorStatus: q.vendorStatus,
    title: q.title,
    category: q.category as VendorCategory,
    status: q.status,
    totalCents: q.totalCents,
    paidCents: paid.get(q.id) ?? 0,
    validUntil: q.validUntil,
    updatedAt: q.updatedAt.toISOString(),
    source: q.source,
  };
}

type InstallmentRecord = typeof quoteInstallments.$inferSelect;

function toInstallment(ev: EventCtx, row: InstallmentRecord, today: string): InstallmentRow {
  return {
    id: row.id,
    quoteId: row.quoteId,
    number: row.number,
    dueOn: row.dueOn,
    amountCents: row.amountCents,
    paidAt: row.paidAt ? localDate(row.paidAt, ev.timezone) : null,
    method: row.method,
    notes: row.notes,
    overdue: !row.paidAt && row.dueOn < today,
  };
}

export async function listQuotes(
  deps: BudgetDeps,
  ev: EventCtx,
  filter: { eventVendorId?: number } = {},
): Promise<QuoteSummary[]> {
  const extra =
    filter.eventVendorId === undefined ? undefined : eq(quotes.eventVendorId, filter.eventVendorId);
  const rows = await quoteQuery(deps.db, ev, extra).orderBy(
    desc(quotes.updatedAt),
    desc(quotes.id),
  );
  const paid = await paidByQuote(deps.db, ev);
  return rows.map((r) => toSummary(r, paid));
}

export async function getQuote(
  deps: BudgetDeps,
  ev: EventCtx,
  quoteId: number,
): Promise<QuoteView> {
  const { db } = deps;
  const [row] = await quoteQuery(db, ev, eq(quotes.id, quoteId));
  if (!row) throw notFound();
  const [items, installments, paid] = await Promise.all([
    db
      .select()
      .from(quoteItems)
      .where(and(byEvent(quoteItems, ev), eq(quoteItems.quoteId, quoteId)))
      .orderBy(asc(quoteItems.sort), asc(quoteItems.id)),
    db
      .select()
      .from(quoteInstallments)
      .where(and(byEvent(quoteInstallments, ev), eq(quoteInstallments.quoteId, quoteId)))
      .orderBy(asc(quoteInstallments.number)),
    paidByQuote(db, ev, quoteId),
  ]);
  const today = localDate(nowOf(deps), ev.timezone);
  return {
    ...toSummary(row, paid),
    discountCents: row.discountCents,
    notes: row.notes,
    items: items.map((it) => ({
      id: it.id,
      description: it.description,
      quantity: it.quantity,
      unitCents: it.unitCents,
      totalCents: quoteItemTotal(it),
    })),
    installments: installments.map((it) => toInstallment(ev, it, today)),
  };
}

/* ------------------------------------------------------------------------ */
/* Escrita                                                                   */
/* ------------------------------------------------------------------------ */

/** Categoria própria tem de ser da organização do evento (de outra → 422). */
async function assertCategory(
  db: Database,
  ev: EventCtx,
  keys: string[],
  allowArchived = false,
): Promise<void> {
  const bad = await categoriesProblem(db, ev.orgId, keys, { allowArchived });
  if (bad) throw unprocessable(bad, "category");
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** O fornecedor tem de estar ligado a este evento (de outro evento → 422). */
async function eventVendorOf(db: Database | Tx, ev: EventCtx, eventVendorId: number) {
  const [row] = await db
    .select({ id: eventVendors.id, category: eventVendors.category })
    .from(eventVendors)
    .where(and(byEvent(eventVendors, ev), eq(eventVendors.id, eventVendorId)));
  if (!row) throw unprocessable("Escolha um fornecedor deste evento.", "eventVendorId");
  return row;
}

/** Lê o orçamento travando a linha (mudança de status e parcelas na mesma transação). */
async function lockQuote(tx: Tx, ev: EventCtx, quoteId: number) {
  const [row] = await tx
    .select({
      id: quotes.id,
      status: quotes.status,
      totalCents: quotes.totalCents,
      eventVendorId: quotes.eventVendorId,
    })
    .from(quotes)
    .where(and(byEvent(quotes, ev), eq(quotes.id, quoteId)))
    .for("update");
  if (!row) throw notFound();
  return row;
}

const immutable = () =>
  new BudgetError(409, "Orçamento contratado não se altera. Só o plano de parcelas pode mudar.");

async function writeItems(tx: Tx, ev: EventCtx, quoteId: number, input: QuoteInput, now: Date) {
  await tx.delete(quoteItems).where(and(byEvent(quoteItems, ev), eq(quoteItems.quoteId, quoteId)));
  if (input.items.length === 0) return;
  await tx.insert(quoteItems).values(
    input.items.map((it, i) => ({
      eventId: ev.id,
      quoteId,
      description: it.description,
      quantity: it.quantity,
      unitCents: it.unitCents,
      sort: (i + 1) * 10,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

/**
 * Fase 7: orçamento enviado pelo fornecedor no portal. Entra direto como "recebido", com a
 * procedência (`source = portal` e o link usado); a equipe aprova/contrata como os outros.
 */
export interface PortalQuoteOrigin {
  portalLinkId: number;
}

export async function createQuote(
  deps: BudgetDeps,
  ev: EventCtx,
  input: QuoteInput,
  portal?: PortalQuoteOrigin,
) {
  const totalCents = computeQuoteTotal(input);
  if (input.validUntil && !isCalendarDate(input.validUntil)) {
    throw unprocessable("Data de validade inválida.", "validUntil");
  }
  const now = nowOf(deps);
  if (input.category) await assertCategory(deps.db, ev, [input.category]);
  const id = await deps.db.transaction(async (tx) => {
    const vendor = await eventVendorOf(tx, ev, input.eventVendorId);
    const [res] = await tx.insert(quotes).values({
      eventId: ev.id,
      eventVendorId: vendor.id,
      title: input.title,
      category: input.category ?? vendor.category,
      discountCents: input.discountCents,
      totalCents,
      validUntil: input.validUntil,
      notes: input.notes,
      ...(portal
        ? {
            status: "received" as const,
            receivedAt: now,
            source: "portal" as const,
            portalLinkId: portal.portalLinkId,
          }
        : {}),
      createdAt: now,
      updatedAt: now,
    });
    await writeItems(tx, ev, res.insertId, input, now);
    return res.insertId;
  });
  return getQuote(deps, ev, id);
}

export async function updateQuote(
  deps: BudgetDeps,
  ev: EventCtx,
  quoteId: number,
  input: QuoteInput,
) {
  const totalCents = computeQuoteTotal(input);
  if (input.validUntil && !isCalendarDate(input.validUntil)) {
    throw unprocessable("Data de validade inválida.", "validUntil");
  }
  const now = nowOf(deps);
  if (input.category) await assertCategory(deps.db, ev, [input.category], true);
  await deps.db.transaction(async (tx) => {
    const current = await lockQuote(tx, ev, quoteId);
    if (current.status === "contracted") throw immutable();
    const vendor = await eventVendorOf(tx, ev, input.eventVendorId);
    await tx
      .update(quotes)
      .set({
        eventVendorId: vendor.id,
        title: input.title,
        category: input.category ?? vendor.category,
        discountCents: input.discountCents,
        totalCents,
        validUntil: input.validUntil,
        notes: input.notes,
        updatedAt: now,
      })
      .where(and(byEvent(quotes, ev), eq(quotes.id, quoteId)));
    await writeItems(tx, ev, quoteId, input, now);
  });
  return getQuote(deps, ev, quoteId);
}

export async function deleteQuote(deps: BudgetDeps, ev: EventCtx, quoteId: number) {
  await deps.db.transaction(async (tx) => {
    const current = await lockQuote(tx, ev, quoteId);
    if (current.status === "contracted") throw immutable();
    await tx.delete(quotes).where(and(byEvent(quotes, ev), eq(quotes.id, quoteId)));
  });
}

const STAMP: Partial<
  Record<QuoteStatus, "receivedAt" | "approvedAt" | "contractedAt" | "declinedAt">
> = {
  received: "receivedAt",
  approved: "approvedAt",
  contracted: "contractedAt",
  declined: "declinedAt",
};

/** Confere a soma do plano: `alreadyPaid` + parcelas novas = total. */
function checkPlanSum(totalCents: number, alreadyPaid: number, installments: InstallmentInput[]) {
  const sum = alreadyPaid + installments.reduce((s, it) => s + it.amountCents, 0);
  if (sum !== totalCents) {
    const brl = (c: number) => (c / 100).toFixed(2).replace(".", ",");
    throw unprocessable(
      `As parcelas somam R$ ${brl(sum)}, mas o orçamento é de R$ ${brl(totalCents)}.`,
      "installments",
    );
  }
}

export async function changeQuoteStatus(
  deps: BudgetDeps,
  ev: EventCtx,
  quoteId: number,
  change: QuoteStatusChange,
) {
  const now = nowOf(deps);
  await deps.db.transaction(async (tx) => {
    const current = await lockQuote(tx, ev, quoteId);
    const to = change.status;
    if (!QUOTE_TRANSITIONS[current.status].includes(to)) {
      throw unprocessable(
        current.status === to
          ? `O orçamento já está como "${QUOTE_STATUS_LABELS[to]}".`
          : `Não dá para passar de "${QUOTE_STATUS_LABELS[current.status]}" para "${QUOTE_STATUS_LABELS[to]}".`,
        "status",
      );
    }
    if (to === "contracted") {
      const installments = change.installments;
      if (!installments?.length) {
        throw unprocessable("Para contratar, informe o plano de parcelas.", "installments");
      }
      if (current.totalCents <= 0) {
        throw unprocessable("Orçamento sem valor não pode ser contratado.", "items");
      }
      checkDates(installments);
      checkPlanSum(current.totalCents, 0, installments);
      await insertInstallments(tx, ev, quoteId, installments, 1, now);
      await tx
        .update(eventVendors)
        .set({ status: "hired", updatedAt: now })
        .where(and(byEvent(eventVendors, ev), eq(eventVendors.id, current.eventVendorId)));
    }
    const stamp = STAMP[to];
    await tx
      .update(quotes)
      .set({ status: to, updatedAt: now, ...(stamp ? { [stamp]: now } : {}) })
      .where(and(byEvent(quotes, ev), eq(quotes.id, quoteId)));
  });
  return getQuote(deps, ev, quoteId);
}

/**
 * Reabre um orçamento contratado (volta a "aprovado") se nenhuma parcela foi paga: apaga as
 * parcelas, na mesma transação da linha travada. Com parcela paga → 409.
 */
export async function reopenQuote(deps: BudgetDeps, ev: EventCtx, quoteId: number) {
  const now = nowOf(deps);
  await deps.db.transaction(async (tx) => {
    const current = await lockQuote(tx, ev, quoteId);
    if (current.status !== "contracted") {
      throw new BudgetError(409, "Só um orçamento contratado pode ser reaberto.");
    }
    const paid = await tx
      .select({ id: quoteInstallments.id })
      .from(quoteInstallments)
      .where(
        and(
          byEvent(quoteInstallments, ev),
          eq(quoteInstallments.quoteId, quoteId),
          isNotNull(quoteInstallments.paidAt),
        ),
      )
      .for("update");
    if (paid.length > 0) {
      throw new BudgetError(
        409,
        "Há parcelas pagas neste orçamento. Desfaça os pagamentos antes de reabri-lo.",
      );
    }
    await tx
      .delete(quoteInstallments)
      .where(and(byEvent(quoteInstallments, ev), eq(quoteInstallments.quoteId, quoteId)));
    await tx
      .update(quotes)
      .set({ status: "approved", contractedAt: null, updatedAt: now })
      .where(and(byEvent(quotes, ev), eq(quotes.id, quoteId)));
  });
  return getQuote(deps, ev, quoteId);
}

const byDue = <T extends { dueOn: string }>(a: T, b: T) =>
  a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0;

async function insertInstallments(
  tx: Tx,
  ev: EventCtx,
  quoteId: number,
  installments: InstallmentInput[],
  firstNumber: number,
  now: Date,
) {
  if (installments.length === 0) return;
  await tx.insert(quoteInstallments).values(
    [...installments].sort(byDue).map((it, i) => ({
      eventId: ev.id,
      quoteId,
      number: firstNumber + i,
      dueOn: it.dueOn,
      amountCents: it.amountCents,
      method: it.method,
      notes: it.notes,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

/**
 * Refaz o plano das parcelas em aberto: as pagas ficam; pagas + novas = total. Todas são
 * renumeradas pelo vencimento (as pagas passam por números negativos para não colidir no
 * índice único `(event_id, quote_id, number)`).
 */
export async function replanInstallments(
  deps: BudgetDeps,
  ev: EventCtx,
  quoteId: number,
  installments: InstallmentInput[],
) {
  const now = nowOf(deps);
  checkDates(installments);
  await deps.db.transaction(async (tx) => {
    const current = await lockQuote(tx, ev, quoteId);
    if (current.status !== "contracted") {
      throw unprocessable("Só orçamento contratado tem plano de parcelas.", "status");
    }
    const scope = and(byEvent(quoteInstallments, ev), eq(quoteInstallments.quoteId, quoteId));
    const paid = await tx
      .select({
        id: quoteInstallments.id,
        dueOn: quoteInstallments.dueOn,
        amountCents: quoteInstallments.amountCents,
      })
      .from(quoteInstallments)
      .where(and(scope, isNotNull(quoteInstallments.paidAt)));
    checkPlanSum(
      current.totalCents,
      paid.reduce((s, p) => s + p.amountCents, 0),
      installments,
    );
    await tx.delete(quoteInstallments).where(and(scope, isNull(quoteInstallments.paidAt)));

    type Entry = { dueOn: string; paidId?: number; input?: InstallmentInput };
    const merged = (
      [
        ...paid.map((p) => ({ dueOn: p.dueOn, paidId: p.id })),
        ...installments.map((it) => ({ dueOn: it.dueOn, input: it })),
      ] as Entry[]
    ).sort((a, b) => byDue(a, b) || (a.paidId ? -1 : 0) - (b.paidId ? -1 : 0));

    for (const p of paid) {
      await tx
        .update(quoteInstallments)
        .set({ number: -p.id })
        .where(and(scope, eq(quoteInstallments.id, p.id)));
    }
    for (const [i, entry] of merged.entries()) {
      if (entry.paidId) {
        await tx
          .update(quoteInstallments)
          .set({ number: i + 1, updatedAt: now })
          .where(and(scope, eq(quoteInstallments.id, entry.paidId)));
      } else if (entry.input) {
        await insertInstallments(tx, ev, quoteId, [entry.input], i + 1, now);
      }
    }
    await tx
      .update(quotes)
      .set({ updatedAt: now })
      .where(and(byEvent(quotes, ev), eq(quotes.id, quoteId)));
  });
  return getQuote(deps, ev, quoteId);
}

export async function setInstallmentPayment(
  deps: BudgetDeps,
  ev: EventCtx,
  installmentId: number,
  payment: InstallmentPayment,
): Promise<InstallmentRow> {
  const { db } = deps;
  if (payment.paidOn !== null && !isCalendarDate(payment.paidOn)) {
    throw unprocessable("Data de pagamento inválida.", "paidOn");
  }
  const now = nowOf(deps);
  const scope = and(byEvent(quoteInstallments, ev), eq(quoteInstallments.id, installmentId));
  const [found] = await db
    .select({ id: quoteInstallments.id })
    .from(quoteInstallments)
    .where(scope);
  if (!found) throw notFound("Parcela");
  await db
    .update(quoteInstallments)
    .set({
      paidAt: payment.paidOn === null ? null : paidOnToInstant(payment.paidOn, ev.timezone),
      ...(payment.method === undefined ? {} : { method: payment.method }),
      updatedAt: now,
    })
    .where(scope);
  const [row] = await db.select().from(quoteInstallments).where(scope);
  return toInstallment(ev, row!, localDate(now, ev.timezone));
}

/* ------------------------------------------------------------------------ */
/* Planejado × realizado                                                     */
/* ------------------------------------------------------------------------ */

export async function getBudget(deps: BudgetDeps, ev: EventCtx): Promise<BudgetView> {
  const { db } = deps;
  const [lines, contracted, paid, open] = await Promise.all([
    db.select().from(budgetLines).where(byEvent(budgetLines, ev)),
    db
      .select({
        category: quotes.category,
        cents: sql<string>`COALESCE(SUM(${quotes.totalCents}), 0)`,
      })
      .from(quotes)
      .where(and(byEvent(quotes, ev), eq(quotes.status, "contracted")))
      .groupBy(quotes.category),
    db
      .select({
        category: quotes.category,
        cents: sql<string>`COALESCE(SUM(${quoteInstallments.amountCents}), 0)`,
      })
      .from(quoteInstallments)
      .innerJoin(
        quotes,
        and(
          eq(quotes.eventId, quoteInstallments.eventId),
          eq(quotes.id, quoteInstallments.quoteId),
        ),
      )
      .where(
        and(
          byEvent(quoteInstallments, ev),
          byEvent(quotes, ev),
          isNotNull(quoteInstallments.paidAt),
        ),
      )
      .groupBy(quotes.category),
    db
      .select({ installment: quoteInstallments, vendorName: vendors.name })
      .from(quoteInstallments)
      .innerJoin(
        quotes,
        and(
          eq(quotes.eventId, quoteInstallments.eventId),
          eq(quotes.id, quoteInstallments.quoteId),
        ),
      )
      .innerJoin(
        eventVendors,
        and(eq(eventVendors.eventId, quotes.eventId), eq(eventVendors.id, quotes.eventVendorId)),
      )
      .innerJoin(
        vendors,
        and(
          eq(vendors.organizationId, eventVendors.organizationId),
          eq(vendors.id, eventVendors.vendorId),
        ),
      )
      .where(
        and(
          byEvent(quoteInstallments, ev),
          byEvent(quotes, ev),
          byEvent(eventVendors, ev),
          isNull(quoteInstallments.paidAt),
        ),
      )
      .orderBy(
        asc(quoteInstallments.dueOn),
        asc(quoteInstallments.number),
        asc(quoteInstallments.id),
      ),
  ]);

  const rows = new Map<string, BudgetCategoryRow>();
  const row = (category: string) => {
    let r = rows.get(category);
    if (!r) {
      r = {
        category: category as VendorCategory,
        plannedCents: 0,
        contractedCents: 0,
        paidCents: 0,
        notes: null,
      };
      rows.set(category, r);
    }
    return r;
  };
  for (const l of lines)
    Object.assign(row(l.category), { plannedCents: l.plannedCents, notes: l.notes });
  for (const c of contracted) row(c.category).contractedCents = Number(c.cents) || 0;
  for (const p of paid) row(p.category).paidCents = Number(p.cents) || 0;

  const order = (c: string) => {
    const i = (VENDOR_CATEGORIES as readonly string[]).indexOf(c);
    return i === -1 ? VENDOR_CATEGORIES.length : i;
  };
  const categories = [...rows.values()].sort((a, b) => order(a.category) - order(b.category));
  const totals = categories.reduce(
    (t, r) => ({
      plannedCents: t.plannedCents + r.plannedCents,
      contractedCents: t.contractedCents + r.contractedCents,
      paidCents: t.paidCents + r.paidCents,
    }),
    { plannedCents: 0, contractedCents: 0, paidCents: 0 },
  );
  const today = localDate(nowOf(deps), ev.timezone);
  return {
    categories,
    totals,
    openInstallments: open.map((o) => ({
      ...toInstallment(ev, o.installment, today),
      vendorName: o.vendorName,
    })),
  };
}

export async function saveBudgetPlan(deps: BudgetDeps, ev: EventCtx, plan: BudgetPlan) {
  const now = nowOf(deps);
  await assertCategory(
    deps.db,
    ev,
    plan.lines.map((l) => l.category),
    true,
  );
  await deps.db.transaction(async (tx) => {
    await tx.delete(budgetLines).where(byEvent(budgetLines, ev));
    if (plan.lines.length === 0) return;
    await tx.insert(budgetLines).values(
      plan.lines.map((l) => ({
        eventId: ev.id,
        category: l.category,
        plannedCents: l.plannedCents,
        notes: l.notes,
        createdAt: now,
        updatedAt: now,
      })),
    );
  });
  return getBudget(deps, ev);
}
