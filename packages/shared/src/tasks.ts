import { z } from "zod";
import { LocalDate } from "./org.ts";
import {
  OffsetDays,
  optionalText,
  TaskCategory,
  TaskStatus,
  type PlanningPerson,
} from "./planning.ts";

/*
 * Fase 4, frente A: tarefas do evento e modelos de tarefas da organização
 * (docs/saas/fase-4.md). Rotas: `/api/admin/events/:eventId/tasks*` e
 * `/api/admin/orgs/:orgId/task-templates*`.
 */

/**
 * Prazo da tarefa: absoluto (`{ kind: "date", date }`), relativo à data do evento
 * (`{ kind: "offset", days }`, -90 = 90 dias antes) ou nenhum (`null`).
 */
export const TaskDue = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("date"), date: LocalDate }),
    z.object({ kind: z.literal("offset"), days: OffsetDays }),
  ])
  .nullable();
export type TaskDue = z.infer<typeof TaskDue>;

/** POST /tasks. */
export const TaskInput = z.object({
  title: z.string().trim().min(1, { error: "Dê um título à tarefa." }).max(191),
  description: optionalText(5000),
  category: TaskCategory.default("geral"),
  status: TaskStatus.default("todo"),
  /** Membro da organização ou anfitrião do evento; null = sem responsável. */
  assigneeUserId: z.string().min(1).max(36).nullable().default(null),
  due: TaskDue.default(null),
});
export type TaskInput = z.infer<typeof TaskInput>;
/** PATCH /tasks/:taskId (só os campos enviados mudam). */
export const TaskUpdate = TaskInput.partial();
export type TaskUpdate = z.infer<typeof TaskUpdate>;

/**
 * Filtro da lista (`?view=`): `open` = não feitas; `overdue` = prazo vencido e não feita;
 * `upcoming` = não feita e vence nos próximos TASK_UPCOMING_DAYS dias; `done` = feitas.
 */
export const TASK_VIEWS = ["all", "open", "overdue", "upcoming", "done"] as const;
export const TaskView = z.enum(TASK_VIEWS);
export type TaskView = z.infer<typeof TaskView>;
/** Janela de "próximas" (dias a partir de hoje, no fuso do evento). */
export const TASK_UPCOMING_DAYS = 30;

export interface TaskRow {
  id: number;
  title: string;
  description: string | null;
  category: TaskCategory;
  status: TaskStatus;
  assignee: Pick<PlanningPerson, "userId" | "name"> | null;
  /** "AAAA-MM-DD" no fuso do evento; null = sem prazo. */
  dueOn: string | null;
  /** Preenchido quando o prazo é relativo à data do evento. */
  dueOffsetDays: number | null;
  /** Calculado no fuso do evento: não feita e com prazo antes de hoje. */
  overdue: boolean;
  completedAt: string | null;
  sort: number;
}

/** GET /tasks?view=… */
export interface TaskList {
  tasks: TaskRow[];
  counts: { open: number; overdue: number; upcoming: number; done: number };
  /** Hoje no fuso do evento ("AAAA-MM-DD"), base de atrasadas e próximas. */
  today: string;
  /** Data do evento no fuso dele; null = evento sem data (prazos relativos ficam sem data). */
  eventDate: string | null;
}

/* ------------------------------------------------------------------------ */
/* Modelos (organização)                                                     */
/* ------------------------------------------------------------------------ */

export const TaskTemplateItemInput = z.object({
  title: z.string().trim().min(1, { error: "Dê um título à tarefa." }).max(191),
  description: optionalText(5000),
  category: TaskCategory.default("geral"),
  offsetDays: OffsetDays,
});
export type TaskTemplateItemInput = z.infer<typeof TaskTemplateItemInput>;

/** POST /task-templates e PUT /task-templates/:templateId (troca os itens inteiros). */
export const TaskTemplateInput = z.object({
  name: z.string().trim().min(1, { error: "Dê um nome ao modelo." }).max(191),
  /** Um de EVENT_TYPES; null = qualquer tipo. */
  eventType: z.string().trim().min(1).max(32).nullable().default(null),
  description: optionalText(5000),
  items: z.array(TaskTemplateItemInput).max(300).default([]),
});
export type TaskTemplateInput = z.infer<typeof TaskTemplateInput>;

export interface TaskTemplateSummary {
  id: number;
  name: string;
  eventType: string | null;
  description: string | null;
  itemCount: number;
}

export interface TaskTemplateView extends TaskTemplateSummary {
  items: (TaskTemplateItemInput & { id: number; sort: number })[];
}

/** POST /api/admin/events/:eventId/tasks/apply-template */
export const ApplyTaskTemplate = z.object({ templateId: z.number().int().positive() });
export type ApplyTaskTemplate = z.infer<typeof ApplyTaskTemplate>;
export interface ApplyTaskTemplateResult {
  created: number;
}
