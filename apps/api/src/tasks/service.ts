import {
  and,
  asc,
  byEvent,
  eq,
  eventMembers,
  eventTasks,
  organizationMembers,
  sql,
  taskTemplateItems,
  taskTemplates,
  user,
  type Database,
} from "@casamento/db";
import {
  TASK_UPCOMING_DAYS,
  type PlanningPerson,
  type TaskInput,
  type TaskList,
  type TaskRow,
  type TaskUpdate,
  type TaskView,
} from "@casamento/shared";
import type { EventCtx } from "../tenancy/types.ts";
import { addDays, dueColumns, eventLocalDate, localDate } from "./dates.ts";

type TaskRecord = typeof eventTasks.$inferSelect;

/** Erro de regra de negócio (a rota vira 422 com `field`). */
export class TaskRuleError extends Error {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

function toRow(t: TaskRecord, assigneeName: string | null, today: string): TaskRow {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    category: t.category as TaskRow["category"],
    status: t.status,
    assignee: t.assigneeUserId ? { userId: t.assigneeUserId, name: assigneeName ?? "" } : null,
    dueOn: t.dueOn,
    dueOffsetDays: t.dueOffsetDays,
    overdue: t.status !== "done" && t.dueOn !== null && t.dueOn < today,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    sort: t.sort,
  };
}

async function loadRows(db: Database, ev: EventCtx, now: Date, taskId?: number) {
  const today = localDate(now, ev.timezone);
  const where =
    taskId === undefined
      ? byEvent(eventTasks, ev)
      : and(byEvent(eventTasks, ev), eq(eventTasks.id, taskId));
  const rows = await db
    .select({ task: eventTasks, assigneeName: user.name })
    .from(eventTasks)
    .leftJoin(user, eq(user.id, eventTasks.assigneeUserId))
    .where(where)
    .orderBy(
      asc(sql`${eventTasks.dueOn} is null`),
      asc(eventTasks.dueOn),
      asc(eventTasks.sort),
      asc(eventTasks.id),
    );
  return { today, rows: rows.map((r) => toRow(r.task, r.assigneeName, today)) };
}

export async function listTasks(
  db: Database,
  ev: EventCtx,
  view: TaskView,
  now: Date,
): Promise<TaskList> {
  const { today, rows } = await loadRows(db, ev, now);
  const limit = addDays(today, TASK_UPCOMING_DAYS);
  const isOpen = (t: TaskRow) => t.status !== "done";
  const isUpcoming = (t: TaskRow) =>
    isOpen(t) && t.dueOn !== null && t.dueOn >= today && t.dueOn <= limit;
  const counts = {
    open: rows.filter(isOpen).length,
    overdue: rows.filter((t) => t.overdue).length,
    upcoming: rows.filter(isUpcoming).length,
    done: rows.filter((t) => !isOpen(t)).length,
  };
  const filters: Record<TaskView, (t: TaskRow) => boolean> = {
    all: () => true,
    open: isOpen,
    overdue: (t) => t.overdue,
    upcoming: isUpcoming,
    done: (t) => !isOpen(t),
  };
  let tasks = rows.filter(filters[view]);
  if (view === "done") {
    tasks = tasks.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  }
  return { tasks, counts, today, eventDate: eventLocalDate(ev) };
}

async function getRow(db: Database, ev: EventCtx, id: number, now: Date): Promise<TaskRow | null> {
  const { rows } = await loadRows(db, ev, now, id);
  return rows[0] ?? null;
}

/** Quem pode ser responsável: membros da organização do evento e anfitriões do evento. */
export async function listAssignees(db: Database, ev: EventCtx): Promise<PlanningPerson[]> {
  const members = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(user, eq(user.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, ev.orgId))
    .orderBy(asc(user.name));
  const hosts = await db
    .select({ userId: user.id, name: user.name, email: user.email })
    .from(eventMembers)
    .innerJoin(user, eq(user.id, eventMembers.userId))
    .where(and(eq(eventMembers.eventId, ev.id), eq(eventMembers.role, "host")))
    .orderBy(asc(user.name));
  const people = new Map<string, PlanningPerson>();
  for (const m of members) {
    people.set(m.userId, {
      userId: m.userId,
      name: m.name,
      email: m.email,
      role: m.role === "owner" ? "org_owner" : "org_member",
    });
  }
  for (const h of hosts) {
    if (!people.has(h.userId)) people.set(h.userId, { ...h, role: "event_host" });
  }
  return [...people.values()];
}

async function assertAssignee(db: Database, ev: EventCtx, userId: string | null | undefined) {
  if (!userId) return;
  const people = await listAssignees(db, ev);
  if (!people.some((p) => p.userId === userId)) {
    throw new TaskRuleError(
      "O responsável precisa ser da equipe da organização ou anfitrião deste evento.",
      "assigneeUserId",
    );
  }
}

async function nextSort(db: Database, ev: EventCtx): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${eventTasks.sort})` })
    .from(eventTasks)
    .where(byEvent(eventTasks, ev));
  return Number(row?.max ?? 0) + 1;
}

export async function createTask(
  db: Database,
  ev: EventCtx,
  input: TaskInput,
  actor: { id: string },
  now: Date,
): Promise<TaskRow> {
  await assertAssignee(db, ev, input.assigneeUserId);
  const due = dueColumns(input.due, eventLocalDate(ev));
  const done = input.status === "done";
  const [res] = await db.insert(eventTasks).values({
    eventId: ev.id,
    title: input.title,
    description: input.description,
    category: input.category,
    status: input.status,
    assigneeUserId: input.assigneeUserId,
    ...due,
    completedAt: done ? now : null,
    completedBy: done ? actor.id : null,
    sort: await nextSort(db, ev),
  });
  return (await getRow(db, ev, res.insertId, now))!;
}

export async function updateTask(
  db: Database,
  ev: EventCtx,
  id: number,
  patch: TaskUpdate,
  actor: { id: string },
  now: Date,
): Promise<TaskRow | null> {
  const [current] = await db
    .select()
    .from(eventTasks)
    .where(and(byEvent(eventTasks, ev), eq(eventTasks.id, id)));
  if (!current) return null;
  if (patch.assigneeUserId !== undefined && patch.assigneeUserId !== current.assigneeUserId) {
    await assertAssignee(db, ev, patch.assigneeUserId);
  }
  const set: Partial<typeof eventTasks.$inferInsert> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.category !== undefined) set.category = patch.category;
  if (patch.assigneeUserId !== undefined) set.assigneeUserId = patch.assigneeUserId;
  if (patch.due !== undefined) Object.assign(set, dueColumns(patch.due, eventLocalDate(ev)));
  if (patch.status !== undefined && patch.status !== current.status) {
    set.status = patch.status;
    if (patch.status === "done") {
      set.completedAt = now;
      set.completedBy = actor.id;
    } else if (current.status === "done") {
      set.completedAt = null;
      set.completedBy = null;
    }
  }
  if (Object.keys(set).length > 0) {
    await db
      .update(eventTasks)
      .set(set)
      .where(and(byEvent(eventTasks, ev), eq(eventTasks.id, id)));
  }
  return getRow(db, ev, id, now);
}

export async function deleteTask(db: Database, ev: EventCtx, id: number): Promise<boolean> {
  const [res] = await db
    .delete(eventTasks)
    .where(and(byEvent(eventTasks, ev), eq(eventTasks.id, id)));
  return res.affectedRows > 0;
}

/**
 * Recalcula `due_on` das tarefas com prazo relativo a partir da data do evento (`ev.startsAt`
 * no fuso do evento). A integração chama isto ao mudar a data/fuso do evento, passando o
 * contexto já atualizado. Sem data, as tarefas relativas ficam sem `due_on`. Devolve quantas
 * mudaram.
 */
export async function recalculateTaskDues(db: Database, ev: EventCtx): Promise<number> {
  const eventDate = eventLocalDate(ev);
  const rows = await db
    .select({ id: eventTasks.id, dueOn: eventTasks.dueOn, offset: eventTasks.dueOffsetDays })
    .from(eventTasks)
    .where(and(byEvent(eventTasks, ev), sql`${eventTasks.dueOffsetDays} is not null`));
  let updated = 0;
  for (const r of rows) {
    const next = eventDate ? addDays(eventDate, r.offset!) : null;
    if (next === r.dueOn) continue;
    await db
      .update(eventTasks)
      .set({ dueOn: next })
      .where(and(byEvent(eventTasks, ev), eq(eventTasks.id, r.id)));
    updated++;
  }
  return updated;
}

/** Copia os itens de um modelo da organização do evento para tarefas. null = modelo não é da org. */
export async function applyTemplate(
  db: Database,
  ev: EventCtx,
  templateId: number,
): Promise<number | null> {
  const [template] = await db
    .select({ id: taskTemplates.id })
    .from(taskTemplates)
    .where(and(eq(taskTemplates.organizationId, ev.orgId), eq(taskTemplates.id, templateId)));
  if (!template) return null;
  const items = await db
    .select()
    .from(taskTemplateItems)
    .where(
      and(
        eq(taskTemplateItems.organizationId, ev.orgId),
        eq(taskTemplateItems.templateId, template.id),
      ),
    )
    .orderBy(asc(taskTemplateItems.sort), asc(taskTemplateItems.id));
  if (items.length === 0) return 0;
  const eventDate = eventLocalDate(ev);
  const first = await nextSort(db, ev);
  await db.insert(eventTasks).values(
    items.map((it, i) => ({
      eventId: ev.id,
      title: it.title,
      description: it.description,
      category: it.category,
      status: "todo" as const,
      ...dueColumns({ kind: "offset", days: it.offsetDays }, eventDate),
      templateItemId: it.id,
      sort: first + i,
    })),
  );
  return items.length;
}
