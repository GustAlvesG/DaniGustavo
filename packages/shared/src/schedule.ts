import { z } from "zod";
import { LocalDate, LocalTime } from "./org.ts";
import { optionalText } from "./planning.ts";

/*
 * Fase 4, frente D: cronograma (roteiro) do dia do evento (docs/saas/fase-4.md).
 * Rotas: `/api/admin/events/:eventId/schedule*`. Horários digitados no fuso do evento; a API
 * grava em UTC (`localDateTimeToIso`) e devolve data e hora locais.
 */

/** POST /schedule. */
export const ScheduleItemInput = z.object({
  /** Dia local; padrão = o dia do evento. */
  date: LocalDate.optional(),
  startTime: LocalTime,
  endTime: LocalTime.nullish().transform((v) => v ?? null),
  title: z.string().trim().min(1, { error: "Descreva a atividade." }).max(191),
  details: optionalText(5000),
  location: optionalText(191),
  responsible: optionalText(191),
  /** Fornecedor do evento responsável (precisa ser do evento). */
  eventVendorId: z.number().int().positive().nullable().default(null),
});
export type ScheduleItemInput = z.infer<typeof ScheduleItemInput>;
/** PATCH /schedule/:itemId (só os campos enviados mudam). */
export const ScheduleItemUpdate = ScheduleItemInput.omit({ eventVendorId: true })
  .partial()
  .extend({ eventVendorId: z.number().int().positive().nullable().optional() });
export type ScheduleItemUpdate = z.infer<typeof ScheduleItemUpdate>;

export interface ScheduleItemRow {
  id: number;
  /** Data e horas locais (fuso do evento). */
  date: string;
  startTime: string;
  endTime: string | null;
  /** ISO UTC. */
  startsAt: string;
  endsAt: string | null;
  title: string;
  details: string | null;
  location: string | null;
  responsible: string | null;
  eventVendor: { id: number; name: string } | null;
  sort: number;
}

/** GET /schedule */
export interface ScheduleView {
  timezone: string;
  /** Dia do evento (local), padrão do formulário; null se o evento não tem data. */
  eventDate: string | null;
  items: ScheduleItemRow[];
}
