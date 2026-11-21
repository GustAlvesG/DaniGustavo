import { localDateTimeToIso } from "@casamento/shared";

/** Data "AAAA-MM-DD" e hora "HH:MM" de um instante no fuso do evento. */
export function toLocalParts(instant: Date, timeZone: string): { date: string; time: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(instant)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Soma dias a uma data de calendário "AAAA-MM-DD" (sem fuso: é só calendário). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Data + hora locais → instante UTC (Date). */
export function localToDate(date: string, time: string, timeZone: string): Date {
  return new Date(localDateTimeToIso(date, time, timeZone));
}

/**
 * Início e fim em UTC a partir de data e horas locais. Fim antes do início = no dia seguinte
 * (festa que passa da meia-noite); fim igual ao início é recusado (null).
 */
export function resolveRange(
  date: string,
  startTime: string,
  endTime: string | null,
  timeZone: string,
): { startsAt: Date; endsAt: Date | null } | null {
  const startsAt = localToDate(date, startTime, timeZone);
  if (!endTime) return { startsAt, endsAt: null };
  if (endTime === startTime) return null;
  const endDate = endTime < startTime ? addDays(date, 1) : date;
  return { startsAt, endsAt: localToDate(endDate, endTime, timeZone) };
}
