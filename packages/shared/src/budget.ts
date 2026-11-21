import { z } from "zod";
import { LocalDate } from "./org.ts";
import {
  Cents,
  optionalText,
  QuoteStatus,
  VendorCategory,
  type EventVendorStatus,
} from "./planning.ts";

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
  category: VendorCategory.optional(),
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

/** PUT /quotes/:quoteId/installments: refaz o plano (parcelas já pagas não podem sumir). */
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
  category: VendorCategory;
  status: QuoteStatus;
  totalCents: number;
  paidCents: number;
  validUntil: string | null;
  updatedAt: string;
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
    .array(z.object({ category: VendorCategory, plannedCents: Cents, notes: optionalText(300) }))
    .max(50)
    .refine((ls) => new Set(ls.map((l) => l.category)).size === ls.length, {
      error: "Categoria repetida.",
    }),
});
export type BudgetPlan = z.infer<typeof BudgetPlan>;

/** Uma linha do planejado × realizado. */
export interface BudgetCategoryRow {
  category: VendorCategory;
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
