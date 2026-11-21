import { z } from "zod";
import { LocalDate } from "./org.ts";
import {
  Cents,
  optionalText,
  QuoteStatus,
  VendorCategoryKey,
  type EventVendorStatus,
} from "./planning.ts";
import type { PortalSource } from "./vendor-portal.ts";

/*
 * Fase 4, frente C: orçamentos de fornecedores, parcelas e planejado × realizado
 * (docs/saas/fase-4.md). Rotas: `/api/admin/events/:eventId/{quotes,installments,budget}*`.
 * Dinheiro sempre em centavos.
 */

export const QuoteItemInput = z.object({
  description: z.string().trim().min(1, { error: "Descreva o item." }).max(300),
  quantity: z.number().int().min(1, { error: "Quantidade mínima: 1." }).max(100_000),
  unitCents: Cents,
});
export type QuoteItemInput = z.infer<typeof QuoteItemInput>;

/** POST /quotes e PUT /quotes/:quoteId (troca os itens inteiros; contratado não se edita). */
export const QuoteInput = z.object({
  eventVendorId: z.number().int().positive(),
  title: z.string().trim().min(1, { error: "Dê um nome ao orçamento." }).max(191),
  /** Padrão: a categoria do fornecedor no evento. */
  category: VendorCategoryKey.optional(),
  discountCents: Cents.default(0),
  validUntil: LocalDate.nullish().transform((v) => v ?? null),
  notes: optionalText(5000),
  items: z.array(QuoteItemInput).max(200).default([]),
});
export type QuoteInput = z.infer<typeof QuoteInput>;

/** Parcela do plano de pagamento (ao contratar ou ao refazer o plano). */
export const InstallmentInput = z.object({
  dueOn: LocalDate,
  amountCents: Cents.refine((v) => v > 0, { error: "Parcela precisa ter valor." }),
  method: optionalText(32),
  notes: optionalText(300),
});
export type InstallmentInput = z.infer<typeof InstallmentInput>;

/**
 * POST /quotes/:quoteId/status. Para `contracted`, `installments` é obrigatório e a soma tem de
 * bater com o total do orçamento (422 se faltar ou não bater).
 */
export const QuoteStatusChange = z.object({
  status: QuoteStatus,
  installments: z.array(InstallmentInput).min(1).max(60).optional(),
});
export type QuoteStatusChange = z.infer<typeof QuoteStatusChange>;

/**
 * PUT /quotes/:quoteId/installments: refaz o plano das parcelas **em aberto**. As já pagas
 * ficam como estão (nunca somem); pagas + novas têm de somar o total (422). Todas são
 * renumeradas pela ordem de vencimento.
 */
export const InstallmentPlan = z.object({
  installments: z.array(InstallmentInput).min(1).max(60),
});
export type InstallmentPlan = z.infer<typeof InstallmentPlan>;

/** PATCH /installments/:installmentId: marcar como paga (com a data) ou desfazer. */
export const InstallmentPayment = z.object({
  /** "AAAA-MM-DD" do pagamento; null desfaz. */
  paidOn: LocalDate.nullable(),
  method: optionalText(32).optional(),
});
export type InstallmentPayment = z.infer<typeof InstallmentPayment>;

export interface QuoteItemRow extends QuoteItemInput {
  id: number;
  totalCents: number;
}

export interface InstallmentRow {
  id: number;
  quoteId: number;
  number: number;
  dueOn: string;
  amountCents: number;
  /** Data do pagamento "AAAA-MM-DD" no fuso do evento (a `paidOn` informada); null = em aberto. */
  paidAt: string | null;
  method: string | null;
  notes: string | null;
  /** Não paga e vencida (no fuso do evento). */
  overdue: boolean;
}

export interface QuoteSummary {
  id: number;
  eventVendorId: number;
  vendorName: string;
  vendorStatus: EventVendorStatus;
  title: string;
  category: VendorCategoryKey;
  status: QuoteStatus;
  totalCents: number;
  paidCents: number;
  validUntil: string | null;
  updatedAt: string;
  /** Fase 7: lançado pela equipe (`panel`) ou enviado pelo fornecedor no portal (`portal`). */
  source: PortalSource;
}

export interface QuoteView extends QuoteSummary {
  discountCents: number;
  notes: string | null;
  items: QuoteItemRow[];
  installments: InstallmentRow[];
}

/** PUT /budget: previsto por categoria (categoria ausente = sem previsão). */
export const BudgetPlan = z.object({
  lines: z
    .array(z.object({ category: VendorCategoryKey, plannedCents: Cents, notes: optionalText(300) }))
    .max(50)
    .refine((ls) => new Set(ls.map((l) => l.category)).size === ls.length, {
      error: "Categoria repetida.",
    }),
});
export type BudgetPlan = z.infer<typeof BudgetPlan>;

/** Uma linha do planejado × realizado. */
export interface BudgetCategoryRow {
  category: VendorCategoryKey;
  plannedCents: number;
  /** Soma dos orçamentos contratados da categoria. */
  contractedCents: number;
  /** Soma das parcelas pagas da categoria. */
  paidCents: number;
  notes: string | null;
}

/** GET /budget: planejado × contratado × pago, por categoria e no total. */
export interface BudgetView {
  categories: BudgetCategoryRow[];
  totals: { plannedCents: number; contractedCents: number; paidCents: number };
  /** Parcelas não pagas, vencidas primeiro, depois por vencimento. */
  openInstallments: (InstallmentRow & { vendorName: string })[];
}

/* ------------------------------------------------------------------------ */
/* Cálculos (usados pela API e pelo painel)                                  */
/* ------------------------------------------------------------------------ */

/** Total de um item: quantidade × valor unitário, em centavos. */
export const quoteItemTotal = (item: Pick<QuoteItemInput, "quantity" | "unitCents">) =>
  item.quantity * item.unitCents;

/** Soma dos itens (antes do desconto), em centavos. */
export const quoteSubtotal = (items: Pick<QuoteItemInput, "quantity" | "unitCents">[]) =>
  items.reduce((sum, it) => sum + quoteItemTotal(it), 0);

/**
 * Divide `totalCents` em `n` parcelas inteiras sem perder centavo: as primeiras levam o resto
 * (R$ 100,00 em 3 → 33,34 + 33,33 + 33,33).
 */
export function splitCents(totalCents: number, n: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new Error("Total inválido.");
  if (!Number.isInteger(n) || n < 1) throw new Error("Número de parcelas inválido.");
  const base = Math.floor(totalCents / n);
  const rest = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/** "AAAA-MM-DD" que existe no calendário (recusa 2027-02-30). */
export function isCalendarDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/**
 * Soma meses a uma data "AAAA-MM-DD", prendendo o dia no fim do mês
 * (31/01 + 1 mês = 28/02 ou 29/02).
 */
export function addMonths(date: string, months: number): string {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, mo - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Plano de parcelas mensais: `n` parcelas a partir de `firstDueOn`, uma por mês, somando
 * exatamente `totalCents` (o painel monta o plano com isto e o casal ajusta antes de contratar).
 */
export function planInstallments(
  totalCents: number,
  n: number,
  firstDueOn: string,
): { dueOn: string; amountCents: number }[] {
  return splitCents(totalCents, n).map((amountCents, i) => ({
    dueOn: addMonths(firstDueOn, i),
    amountCents,
  }));
}
