import { z } from "zod";
import { LocalDate, LocalTime, TimeZone } from "./org.ts";
import { OffsetDays, TaskCategory } from "./planning.ts";

/*
 * Fase 6, frente E (docs/saas/fase-6.md): ajustes decididos pelo usuário sobre as Fases 2–5 —
 * categorias de fornecedor da organização, lembrete semanal de tarefas, modelos de tarefas da
 * plataforma, data/fuso do evento pela organização. (Reabrir orçamento e esconder botões não
 * precisam de contrato novo.)
 */

/* ------------------------------------------------------------------------ */
/* Categorias de fornecedor por organização                                  */
/* ------------------------------------------------------------------------ */

/**
 * Chave de categoria própria: `c-` + slug (cabe no varchar(32) de `vendors.category`). As 18 fixas
 * (`VENDOR_CATEGORIES`) nunca começam com `c-`, então as duas listas não colidem.
 */
export const CUSTOM_CATEGORY_PATTERN = /^c-[a-z0-9]+(-[a-z0-9]+)*$/;
export const CUSTOM_CATEGORY_MAX = 32;
export const CustomCategoryKey = z
  .string()
  .max(CUSTOM_CATEGORY_MAX)
  .regex(CUSTOM_CATEGORY_PATTERN, { error: "Categoria inválida." });

/** POST /api/admin/orgs/:orgId/vendor-categories (a chave sai do rótulo, na API). */
export const VendorCategoryInput = z.object({
  label: z.string().trim().min(1, { error: "Informe o nome da categoria." }).max(64),
  sort: z.number().int().min(0).max(10_000).default(0),
});
export type VendorCategoryInput = z.infer<typeof VendorCategoryInput>;
/** PATCH …/vendor-categories/:id */
export const VendorCategoryUpdate = z.object({
  label: z.string().trim().min(1).max(64).optional(),
  sort: z.number().int().min(0).max(10_000).optional(),
  archived: z.boolean().optional(),
});
export type VendorCategoryUpdate = z.infer<typeof VendorCategoryUpdate>;

export interface VendorCategoryView {
  id: number;
  key: string;
  label: string;
  sort: number;
  archived: boolean;
  /** Fornecedores e orçamentos que usam a categoria. */
  usage: number;
}

/** Categoria como aparece nas listas de escolha (fixas + próprias não arquivadas). */
export interface CategoryOption {
  key: string;
  label: string;
  custom: boolean;
}

/* ------------------------------------------------------------------------ */
/* Lembrete semanal de tarefas                                               */
/* ------------------------------------------------------------------------ */

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** `event_settings` › `tasks.reminders` (privada): o evento inteiro liga/desliga o resumo. */
export const TaskReminderSettings = z.object({
  enabled: z.boolean().default(true),
  /** Dia da semana do resumo (0 = domingo … 6 = sábado), no fuso do evento. */
  weekday: z.number().int().min(0).max(6).default(1),
  /** Quantos dias à frente entram como "próximas". */
  lookaheadDays: z.number().int().min(1).max(60).default(14),
});
export type TaskReminderSettings = z.infer<typeof TaskReminderSettings>;

/** GET/PUT /api/admin/events/:eventId/tasks/reminders */
export interface TaskRemindersView {
  settings: TaskReminderSettings;
  /** A preferência de quem está logado neste evento (opt-out pessoal). */
  mine: { enabled: boolean; lastSentAt: string | null };
}
export const TaskRemindersUpdate = z.object({
  /** Só quem tem `tasks.write` muda o do evento. */
  settings: TaskReminderSettings.optional(),
  /** Qualquer pessoa com acesso ao evento muda a própria preferência. */
  mine: z.object({ enabled: z.boolean() }).optional(),
});
export type TaskRemindersUpdate = z.infer<typeof TaskRemindersUpdate>;

/* ------------------------------------------------------------------------ */
/* Modelos de tarefas da plataforma                                          */
/* ------------------------------------------------------------------------ */

export interface PlatformTaskTemplateItemView {
  id: number;
  title: string;
  description: string | null;
  category: TaskCategory;
  offsetDays: number;
}

export interface PlatformTaskTemplateView {
  id: number;
  code: string;
  name: string;
  eventType: string | null;
  description: string | null;
  items: PlatformTaskTemplateItemView[];
}

/** Item de modelo da plataforma no seed (packages/db/src/platform-task-templates.ts). */
export const PlatformTaskTemplateItemInput = z.object({
  title: z.string().trim().min(1).max(191),
  description: z.string().trim().max(5000).nullable().default(null),
  category: TaskCategory,
  offsetDays: OffsetDays,
});
export type PlatformTaskTemplateItemInput = z.infer<typeof PlatformTaskTemplateItemInput>;

/* ------------------------------------------------------------------------ */
/* Data e fuso do evento pela organização                                    */
/* ------------------------------------------------------------------------ */

/**
 * PATCH /api/admin/orgs/:orgId/events/:eventId/schedule: mesmo efeito do `PUT /settings` com
 * `wedding.datetime`/`wedding.timezone` (atualiza `events.starts_at/timezone`, invalida o
 * resolver e recalcula os prazos das tarefas).
 */
export const OrgEventDateInput = z.object({
  date: LocalDate,
  time: LocalTime,
  timezone: TimeZone,
});
export type OrgEventDateInput = z.infer<typeof OrgEventDateInput>;
