import type { TaskDue } from "@casamento/shared";

/*
 * Datas de calendário das tarefas ("AAAA-MM-DD") no fuso do evento. O prazo relativo guarda o
 * deslocamento em dias a partir da data do evento; a data é a do calendário local do evento
 * (um evento às 22h em São Paulo cai no dia seguinte em UTC, e o prazo segue o dia local).
 */

/** Dia do calendário de `instant` no fuso `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Soma `days` a uma data de calendário (aritmética em UTC: sem horário de verão no caminho). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface DueColumns {
  dueOn: string | null;
  dueOffsetDays: number | null;
}

/** Colunas `due_on`/`due_offset_days` de um prazo; `eventDate` = data local do evento (ou null). */
export function dueColumns(due: TaskDue, eventDate: string | null): DueColumns {
  if (!due) return { dueOn: null, dueOffsetDays: null };
  if (due.kind === "date") return { dueOn: due.date, dueOffsetDays: null };
  return {
    dueOn: eventDate ? addDays(eventDate, due.days) : null,
    dueOffsetDays: due.days,
  };
}

/** Data local do evento (null se o evento não tem data). */
export function eventLocalDate(ev: { startsAt: Date | null; timezone: string }): string | null {
  return ev.startsAt ? localDate(ev.startsAt, ev.timezone) : null;
}
