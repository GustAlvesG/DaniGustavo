import {
  and,
  asc,
  byEvent,
  eq,
  events,
  eventTasks,
  isNotNull,
  isNull,
  isUniqueViolation,
  or,
  sql,
  taskReminderPrefs,
  type Database,
} from "@casamento/db";
import { TaskReminderSettings } from "@casamento/shared";
import { readSetting } from "../admin/event-settings.ts";
import type { Env } from "../env.ts";
import type { Mailer } from "../mailer.ts";
import { buildTaskReminderEmail, tasksLink } from "../task-reminder-email.ts";
import { crossEvent } from "../tenancy/cross-event.ts";
import { resolverFor, type EventResolver } from "../tenancy/resolver.ts";
import type { EventCtx } from "../tenancy/types.ts";
import { addDays, localDate } from "./dates.ts";
import { listAssignees } from "./service.ts";

/*
 * Fase 6, frente E: resumo semanal de tarefas por e-mail (atrasadas e próximas
 * `lookaheadDays`) para cada responsável, por evento ativo, no dia `weekday` do fuso do evento.
 * Desligado no evento (`tasks.reminders.enabled = false`) ou pela pessoa
 * (`task_reminder_prefs.enabled = false`) → não envia; `last_week` evita repetir na semana.
 * Ligado em server.ts: verifica de hora em hora e só envia a partir das 8h locais do dia.
 */
export interface TaskReminderJobDeps {
  env: Env;
  db: Database;
  mailer: Mailer;
  now: () => Date;
  eventResolver?: EventResolver;
}

export const TASK_REMINDER_INTERVAL_MS = 60 * 60_000;
/** Hora local (do evento) a partir da qual o resumo do dia pode sair. */
export const TASK_REMINDER_HOUR = 8;
export const DEFAULT_TASK_REMINDER_SETTINGS: TaskReminderSettings = TaskReminderSettings.parse({});
export const TASK_REMINDERS_KEY = "tasks.reminders";

/** Configuração do resumo do evento (padrão: ligado, segundas, 14 dias à frente). */
export async function readTaskReminderSettings(
  ev: EventCtx,
  db: Database,
): Promise<TaskReminderSettings> {
  const parsed = TaskReminderSettings.safeParse(await readSetting(ev, db, TASK_REMINDERS_KEY));
  return parsed.success ? parsed.data : DEFAULT_TASK_REMINDER_SETTINGS;
}

/** Semana ISO ("2026-W47") de uma data de calendário "AAAA-MM-DD". */
export function isoWeek(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day); // quinta-feira da semana
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Dia da semana (0 = domingo) e hora do instante no fuso. */
function localWeekdayHour(instant: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hourCycle: "h23",
      hour: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    String(parts["weekday"]),
  );
  return { weekday, hour: Number(parts["hour"]) };
}

export interface TaskReminderResult {
  sent: number;
  failed: number;
}

/** Uma rodada do resumo para um evento. Só envia no dia/hora da semana configurados. */
export async function runEventTaskReminders(
  deps: TaskReminderJobDeps & { ev: EventCtx },
): Promise<TaskReminderResult> {
  const { db, ev, mailer, env } = deps;
  const result: TaskReminderResult = { sent: 0, failed: 0 };
  const settings = await readTaskReminderSettings(ev, db);
  if (!settings.enabled) return result;
  const now = deps.now();
  const local = localWeekdayHour(now, ev.timezone);
  if (local.weekday !== settings.weekday || local.hour < TASK_REMINDER_HOUR) return result;

  const today = localDate(now, ev.timezone);
  const week = isoWeek(today);
  const limit = addDays(today, settings.lookaheadDays);

  const open = await db
    .select({
      title: eventTasks.title,
      dueOn: eventTasks.dueOn,
      assignee: eventTasks.assigneeUserId,
    })
    .from(eventTasks)
    .where(
      and(
        byEvent(eventTasks, ev),
        sql`${eventTasks.status} <> 'done'`,
        isNotNull(eventTasks.assigneeUserId),
        isNotNull(eventTasks.dueOn),
      ),
    )
    .orderBy(asc(eventTasks.dueOn), asc(eventTasks.id));
  if (open.length === 0) return result;

  // Só quem ainda é da equipe da organização ou anfitrião do evento.
  const people = new Map((await listAssignees(db, ev)).map((p) => [p.userId, p]));
  const prefs = new Map(
    (await db.select().from(taskReminderPrefs).where(byEvent(taskReminderPrefs, ev))).map((p) => [
      p.userId,
      p,
    ]),
  );
  const byUser = new Map<string, { overdue: typeof open; upcoming: typeof open }>();
  for (const t of open) {
    const person = people.get(t.assignee!);
    if (!person || !t.dueOn) continue;
    const bucket = byUser.get(person.userId) ?? { overdue: [], upcoming: [] };
    if (t.dueOn < today) bucket.overdue.push(t);
    else if (t.dueOn <= limit) bucket.upcoming.push(t);
    byUser.set(person.userId, bucket);
  }

  for (const [userId, lists] of byUser) {
    if (lists.overdue.length === 0 && lists.upcoming.length === 0) continue;
    const pref = prefs.get(userId);
    if (pref && (!pref.enabled || pref.lastWeek === week)) continue;
    const person = people.get(userId)!;
    // Reserva a semana antes de enviar: duas rodadas ao mesmo tempo não mandam duas vezes.
    if (!(await claimWeek(db, ev, userId, week, now, pref !== undefined))) continue;
    try {
      await mailer.send(
        buildTaskReminderEmail({
          to: person.email,
          name: person.name,
          eventName: ev.name,
          overdue: lists.overdue.map((t) => ({ title: t.title, dueOn: t.dueOn! })),
          upcoming: lists.upcoming.map((t) => ({ title: t.title, dueOn: t.dueOn! })),
          lookaheadDays: settings.lookaheadDays,
          link: tasksLink(env.BETTER_AUTH_URL, ev.id),
        }),
      );
      result.sent++;
    } catch (err) {
      result.failed++;
      console.error(`[tarefas] Falha ao enviar o resumo (evento ${ev.id}):`, err);
      // Devolve a reserva: a próxima rodada do dia tenta de novo.
      await db
        .update(taskReminderPrefs)
        .set({ lastWeek: pref?.lastWeek ?? null, lastSentAt: pref?.lastSentAt ?? null })
        .where(and(byEvent(taskReminderPrefs, ev), eq(taskReminderPrefs.userId, userId)));
    }
  }
  return result;
}

/** Grava `last_week` só se ainda não é esta semana; false = outra rodada já reservou. */
async function claimWeek(
  db: Database,
  ev: EventCtx,
  userId: string,
  week: string,
  now: Date,
  hasRow: boolean,
): Promise<boolean> {
  if (!hasRow) {
    try {
      await db.insert(taskReminderPrefs).values({
        eventId: ev.id,
        userId,
        enabled: true,
        lastWeek: week,
        lastSentAt: now,
      });
      return true;
    } catch (err) {
      if (isUniqueViolation(err)) return false;
      throw err;
    }
  }
  const [res] = await db
    .update(taskReminderPrefs)
    .set({ lastWeek: week, lastSentAt: now, updatedAt: now })
    .where(
      and(
        byEvent(taskReminderPrefs, ev),
        eq(taskReminderPrefs.userId, userId),
        or(isNull(taskReminderPrefs.lastWeek), sql`${taskReminderPrefs.lastWeek} <> ${week}`),
      ),
    );
  return res.affectedRows > 0;
}

/** Uma rodada em todos os eventos ativos (cada um com a sua configuração e fuso). */
export async function runTaskReminderRound(
  deps: TaskReminderJobDeps,
): Promise<Map<number, TaskReminderResult | Error>> {
  const resolver = resolverFor(deps.db, deps.eventResolver);
  const ids = await crossEvent("resumo de tarefas: eventos ativos", () =>
    deps.db.select({ id: events.id }).from(events).where(eq(events.status, "active")),
  );
  const results = new Map<number, TaskReminderResult | Error>();
  for (const { id } of ids) {
    try {
      const ev = await resolver.byId(id);
      if (!ev || ev.status !== "active") continue;
      results.set(id, await runEventTaskReminders({ ...deps, ev }));
    } catch (err) {
      console.error(`[tarefas] Falha no resumo do evento ${id}:`, err);
      results.set(id, err instanceof Error ? err : new Error(String(err)));
    }
  }
  return results;
}

export function startTaskReminderJob(
  deps: TaskReminderJobDeps,
  intervalMs = TASK_REMINDER_INTERVAL_MS,
): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      let sent = 0;
      for (const r of (await runTaskReminderRound(deps)).values()) {
        if (!(r instanceof Error)) sent += r.sent;
      }
      if (sent > 0) console.log(`[tarefas] ${sent} resumo(s) semanal(is) enviado(s).`);
    } catch (err) {
      console.error("[tarefas] Falha na rotina do resumo semanal:", err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
