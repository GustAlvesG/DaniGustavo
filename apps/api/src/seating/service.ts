import {
  and,
  asc,
  byEvent,
  eq,
  guests,
  inArray,
  invitations,
  seatAssignments,
  seatingTables,
  sql,
  type Database,
} from "@casamento/db";
import type { SeatGuestView, SeatingTableView, SeatingView } from "@casamento/shared";
import type { EventSides } from "@casamento/shared";
import type { EventCtx } from "../tenancy/types.ts";

/*
 * Mapa de mesas (Fase 7, frente B). Tudo por `event_id`: mesa e pessoa de outro evento nunca
 * entram aqui (a FK composta de `seat_assignments` também garante no banco).
 */

type TableRow = typeof seatingTables.$inferSelect;

export const isDuplicateKey = (err: unknown): boolean => {
  const e = err as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return (
    e?.code === "ER_DUP_ENTRY" ||
    e?.errno === 1062 ||
    e?.cause?.code === "ER_DUP_ENTRY" ||
    e?.cause?.errno === 1062
  );
};

const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });

function toTable(t: TableRow, people: SeatGuestView[]): SeatingTableView {
  return {
    id: t.id,
    name: t.name,
    seats: t.seats,
    sort: t.sort,
    side: t.side,
    groupLabel: t.groupLabel,
    notes: t.notes,
    guests: people,
    overCapacity: people.length > t.seats,
  };
}

/** Pessoas do evento com convite e mesa (se tiver). `confirmedOnly` só vale para quem está sem mesa. */
async function loadGuests(ev: EventCtx, db: Database) {
  return db
    .select({
      guestId: guests.id,
      name: guests.name,
      isChild: guests.isChild,
      isPlusOne: guests.isPlusOne,
      rsvpStatus: guests.rsvpStatus,
      invitationId: invitations.id,
      invitationLabel: invitations.label,
      side: invitations.side,
      tableId: seatAssignments.tableId,
      seat: seatAssignments.seat,
    })
    .from(guests)
    .innerJoin(invitations, and(eq(guests.invitationId, invitations.id), byEvent(invitations, ev)))
    .leftJoin(
      seatAssignments,
      and(eq(seatAssignments.guestId, guests.id), byEvent(seatAssignments, ev)),
    )
    .where(byEvent(guests, ev))
    .orderBy(asc(invitations.label), asc(guests.isPlusOne), asc(guests.id));
}

export async function buildSeatingView(
  ev: EventCtx,
  db: Database,
  sides: EventSides,
  opts: { all: boolean },
): Promise<SeatingView> {
  const [tables, rows] = await Promise.all([
    db
      .select()
      .from(seatingTables)
      .where(byEvent(seatingTables, ev))
      .orderBy(asc(seatingTables.sort), asc(seatingTables.id)),
    loadGuests(ev, db),
  ]);

  const byTable = new Map<number, SeatGuestView[]>();
  const unassigned: SeatGuestView[] = [];
  let confirmed = 0;
  let seated = 0;
  let seatedNotConfirmed = 0;
  for (const r of rows) {
    const view: SeatGuestView = {
      guestId: r.guestId,
      name: r.name,
      isChild: r.isChild,
      isPlusOne: r.isPlusOne,
      rsvpStatus: r.rsvpStatus,
      invitationId: r.invitationId,
      invitationLabel: r.invitationLabel,
      side: r.side,
      seat: r.seat,
    };
    if (r.rsvpStatus === "confirmed") confirmed++;
    if (r.tableId !== null) {
      seated++;
      if (r.rsvpStatus !== "confirmed") seatedNotConfirmed++;
      byTable.set(r.tableId, [...(byTable.get(r.tableId) ?? []), view]);
    } else if (r.rsvpStatus === "confirmed" || (opts.all && r.rsvpStatus === "pending")) {
      unassigned.push(view);
    }
  }
  // Dentro da mesa: lugares numerados primeiro (em ordem), depois por nome.
  for (const list of byTable.values()) {
    list.sort((a, b) =>
      a.seat !== null && b.seat !== null
        ? a.seat - b.seat
        : a.seat !== null
          ? -1
          : b.seat !== null
            ? 1
            : collator.compare(a.name, b.name),
    );
  }
  return {
    tables: tables.map((t) => toTable(t, byTable.get(t.id) ?? [])),
    unassigned,
    sides: sides.map((s) => ({ key: s.key, label: s.label })),
    stats: {
      tables: tables.length,
      seats: tables.reduce((n, t) => n + t.seats, 0),
      confirmed,
      seated,
      seatedNotConfirmed,
    },
  };
}

export async function buildTableView(
  ev: EventCtx,
  db: Database,
  sides: EventSides,
  tableId: number,
): Promise<SeatingTableView | undefined> {
  const view = await buildSeatingView(ev, db, sides, { all: false });
  return view.tables.find((t) => t.id === tableId);
}

export async function findTable(ev: EventCtx, db: Database, id: number) {
  return (
    await db
      .select()
      .from(seatingTables)
      .where(and(byEvent(seatingTables, ev), eq(seatingTables.id, id)))
      .limit(1)
  )[0];
}

export async function nextTableSort(ev: EventCtx, db: Database): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${seatingTables.sort})` })
    .from(seatingTables)
    .where(byEvent(seatingTables, ev));
  return (row?.max ?? -1) + 1;
}

export type AssignmentChange = { guestId: number; tableId: number | null; seat: number | null };

export class SeatingConflict extends Error {
  kind: "not_found" | "conflict" | "invalid";
  field?: string;
  constructor(message: string, kind: "not_found" | "conflict" | "invalid", field?: string) {
    super(message);
    this.kind = kind;
    this.field = field;
  }
}

/**
 * Aplica as mudanças numa transação só (trocar duas pessoas de lugar funciona porque as
 * linhas das pessoas citadas saem antes de as novas entrarem).
 */
export async function applyAssignments(
  ev: EventCtx,
  db: Database,
  changes: AssignmentChange[],
): Promise<void> {
  const guestIds = changes.map((c) => c.guestId);
  if (new Set(guestIds).size !== guestIds.length) {
    throw new SeatingConflict("Uma pessoa aparece mais de uma vez no pedido.", "invalid");
  }
  const found = await db
    .select({ id: guests.id })
    .from(guests)
    .where(and(byEvent(guests, ev), inArray(guests.id, guestIds)));
  if (found.length !== guestIds.length) {
    throw new SeatingConflict("Convidado", "not_found");
  }
  const tableIds = [...new Set(changes.flatMap((c) => (c.tableId === null ? [] : [c.tableId])))];
  const tables = tableIds.length
    ? await db
        .select()
        .from(seatingTables)
        .where(and(byEvent(seatingTables, ev), inArray(seatingTables.id, tableIds)))
    : [];
  if (tables.length !== tableIds.length) {
    throw new SeatingConflict("Mesa", "not_found");
  }
  const seatsOf = new Map(tables.map((t) => [t.id, t.seats]));
  const taken = new Set<string>();
  for (const c of changes) {
    if (c.tableId === null) continue;
    if (c.seat !== null) {
      if (c.seat > seatsOf.get(c.tableId)!) {
        throw new SeatingConflict("O lugar passa da quantidade de lugares da mesa.", "invalid");
      }
      const key = `${c.tableId}:${c.seat}`;
      if (taken.has(key)) {
        throw new SeatingConflict("Dois convidados no mesmo lugar da mesa.", "conflict");
      }
      taken.add(key);
    }
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(seatAssignments)
        .where(and(byEvent(seatAssignments, ev), inArray(seatAssignments.guestId, guestIds)));
      const rows = changes.flatMap((c) =>
        c.tableId === null
          ? []
          : [{ eventId: ev.id, tableId: c.tableId, guestId: c.guestId, seat: c.seat }],
      );
      if (rows.length > 0) await tx.insert(seatAssignments).values(rows);
    });
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw new SeatingConflict("Esse lugar já está ocupado na mesa.", "conflict", "seat");
    }
    throw err;
  }
}
