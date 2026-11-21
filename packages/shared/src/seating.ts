import { z } from "zod";
import { optionalText } from "./planning.ts";

/*
 * Fase 7, frente B: mapa de mesas (docs/saas/fase-7.md). Rotas em
 * `/api/admin/events/:eventId/seating*` (seating.read / seating.write). Por pessoa (linha de
 * `guests`); só quem confirmou entra na distribuição por padrão. Lotação acima de `seats` é
 * aviso, não bloqueio. A mesa aparece no check-in (frente A lê `seat_assignments`).
 */

export const SEATING_MAX_SEATS = 50;

/** POST /seating/tables */
export const SeatingTableInput = z.object({
  name: z.string().trim().min(1, { error: "Dê um nome à mesa." }).max(64),
  seats: z.number().int().min(1).max(SEATING_MAX_SEATS).default(8),
  /** Lado (`event.sides`); null = qualquer. */
  side: z.string().trim().max(32).nullable().default(null),
  groupLabel: optionalText(64),
  notes: optionalText(300),
});
export type SeatingTableInput = z.infer<typeof SeatingTableInput>;

/** PATCH /seating/tables/:tableId (só os campos enviados; sem `.default()`). */
export const SeatingTableUpdate = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  seats: z.number().int().min(1).max(SEATING_MAX_SEATS).optional(),
  side: z.string().trim().max(32).nullable().optional(),
  groupLabel: optionalText(64).optional(),
  notes: optionalText(300).optional(),
});
export type SeatingTableUpdate = z.infer<typeof SeatingTableUpdate>;

/** PUT /seating/tables/order */
export const SeatingTableOrder = z.object({
  ids: z.array(z.number().int().positive()).max(500),
});
export type SeatingTableOrder = z.infer<typeof SeatingTableOrder>;

/** PUT /seating/assignments: põe (tableId) ou tira (null) pessoas de mesas. */
export const SeatAssignmentsInput = z.object({
  assignments: z
    .array(
      z.object({
        guestId: z.number().int().positive(),
        tableId: z.number().int().positive().nullable(),
        seat: z.number().int().min(1).max(SEATING_MAX_SEATS).nullable().default(null),
      }),
    )
    .min(1)
    .max(1000),
});
export type SeatAssignmentsInput = z.infer<typeof SeatAssignmentsInput>;

export interface SeatGuestView {
  guestId: number;
  name: string;
  isChild: boolean;
  isPlusOne: boolean;
  rsvpStatus: "pending" | "confirmed" | "declined";
  invitationId: number;
  invitationLabel: string;
  side: string;
  seat: number | null;
}

export interface SeatingTableView {
  id: number;
  name: string;
  seats: number;
  sort: number;
  side: string | null;
  groupLabel: string | null;
  notes: string | null;
  guests: SeatGuestView[];
  /** guests.length > seats. */
  overCapacity: boolean;
}

/** GET /seating (?all=1 inclui não confirmados em `unassigned`). */
export interface SeatingView {
  tables: SeatingTableView[];
  unassigned: SeatGuestView[];
  sides: { key: string; label: string }[];
  stats: {
    tables: number;
    seats: number;
    confirmed: number;
    seated: number;
    /** Pessoas que estão em mesa mas não confirmaram (ou recusaram depois). */
    seatedNotConfirmed: number;
  };
}
