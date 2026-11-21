import { z } from "zod";

/*
 * Fase 4 (docs/saas/fase-4.md): listas e regras comuns da gestão do evento (tarefas,
 * fornecedores, orçamentos e cronograma). Arquivo da integração; os contratos de cada frente
 * ficam em `tasks.ts` (A), `vendors.ts` (B), `budget.ts` (C) e `schedule.ts` (D).
 * As listas de status repetem as do schema (`@casamento/db` › planning); um teste do db confere.
 */

/* ------------------------------------------------------------------------ */
/* Categorias                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Categorias de fornecedor e do planejado × realizado (a mesma lista: o orçamento previsto é
 * por categoria de fornecedor). Varchar no banco: categoria nova não exige migration.
 */
export const VENDOR_CATEGORIES = [
  "local",
  "buffet",
  "bebidas",
  "doces",
  "fotografia",
  "filmagem",
  "decoracao",
  "flores",
  "musica",
  "iluminacao",
  "cerimonial",
  "papelaria",
  "trajes",
  "beleza",
  "transporte",
  "hospedagem",
  "lembrancas",
  "outros",
] as const;
export const VendorCategory = z.enum(VENDOR_CATEGORIES, { error: "Categoria inválida." });
export type VendorCategory = z.infer<typeof VendorCategory>;

export const VENDOR_CATEGORY_LABELS: Record<VendorCategory, string> = {
  local: "Local",
  buffet: "Buffet",
  bebidas: "Bebidas",
  doces: "Bolo e doces",
  fotografia: "Fotografia",
  filmagem: "Filmagem",
  decoracao: "Decoração",
  flores: "Flores",
  musica: "Música, som e DJ",
  iluminacao: "Iluminação",
  cerimonial: "Cerimonial",
  papelaria: "Convites e papelaria",
  trajes: "Trajes",
  beleza: "Beleza",
  transporte: "Transporte",
  hospedagem: "Hospedagem",
  lembrancas: "Lembranças",
  outros: "Outros",
};

/** Categorias das tarefas do checklist. */
export const TASK_CATEGORIES = [
  "geral",
  "convidados",
  "fornecedores",
  "financeiro",
  "cerimonia",
  "festa",
  "documentos",
  "visual",
  "outros",
] as const;
export const TaskCategory = z.enum(TASK_CATEGORIES, { error: "Categoria inválida." });
export type TaskCategory = z.infer<typeof TaskCategory>;

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  geral: "Geral",
  convidados: "Convidados",
  fornecedores: "Fornecedores",
  financeiro: "Financeiro",
  cerimonia: "Cerimônia",
  festa: "Festa",
  documentos: "Documentos",
  visual: "Visual e beleza",
  outros: "Outros",
};

/* ------------------------------------------------------------------------ */
/* Status                                                                    */
/* ------------------------------------------------------------------------ */

export const TASK_STATUSES = ["todo", "doing", "done"] as const;
export const TaskStatus = z.enum(TASK_STATUSES, { error: "Situação inválida." });
export type TaskStatus = z.infer<typeof TaskStatus>;
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "A fazer",
  doing: "Em andamento",
  done: "Feita",
};

export const EVENT_VENDOR_STATUSES = ["prospect", "hired", "dismissed"] as const;
export const EventVendorStatus = z.enum(EVENT_VENDOR_STATUSES, { error: "Situação inválida." });
export type EventVendorStatus = z.infer<typeof EventVendorStatus>;
export const EVENT_VENDOR_STATUS_LABELS: Record<EventVendorStatus, string> = {
  prospect: "Em cotação",
  hired: "Contratado",
  dismissed: "Descartado",
};

/**
 * Orçamento: rascunho → recebido → aprovado → contratado (gera as parcelas); recusado a
 * qualquer momento antes de contratado. Transições em QUOTE_TRANSITIONS.
 */
export const QUOTE_STATUSES = ["draft", "received", "approved", "contracted", "declined"] as const;
export const QuoteStatus = z.enum(QUOTE_STATUSES, { error: "Situação inválida." });
export type QuoteStatus = z.infer<typeof QuoteStatus>;
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Rascunho",
  received: "Recebido",
  approved: "Aprovado",
  contracted: "Contratado",
  declined: "Recusado",
};

/** Para onde cada status pode ir (a API recusa o resto com 422). */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ["received", "approved", "declined"],
  received: ["approved", "declined", "draft"],
  approved: ["contracted", "declined", "received"],
  contracted: [],
  declined: ["draft", "received"],
};

/* ------------------------------------------------------------------------ */
/* Regras de entrada comuns                                                  */
/* ------------------------------------------------------------------------ */

/** Valor em centavos (inteiro, não negativo), até R$ 10 milhões. */
export const CENTS_MAX = 1_000_000_000;
export const Cents = z
  .number({ error: "Valor inválido." })
  .int({ error: "Valor em centavos (inteiro)." })
  .min(0, { error: "Valor não pode ser negativo." })
  .max(CENTS_MAX, { error: "Valor alto demais." });

/** Dias em relação à data do evento (-90 = 90 dias antes), até 3 anos para cada lado. */
export const OFFSET_DAYS_MAX = 1100;
export const OffsetDays = z
  .number({ error: "Prazo inválido." })
  .int({ error: "Prazo em dias inteiros." })
  .min(-OFFSET_DAYS_MAX, { error: "Prazo longe demais." })
  .max(OFFSET_DAYS_MAX, { error: "Prazo longe demais." });

/** Texto curto opcional: vazio vira null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Até ${max} caracteres.` })
    .nullish()
    .transform((v) => (v ? v : null));

/** Pessoa que pode ser responsável por tarefa: membro da organização ou anfitrião do evento. */
export interface PlanningPerson {
  userId: string;
  name: string;
  email: string;
  /** "org_owner" | "org_member" | "event_host" */
  role: "org_owner" | "org_member" | "event_host";
}
