import {
  and,
  asc,
  byEvent,
  checkinLinks,
  checkins,
  desc,
  eq,
  guests,
  inArray,
  invitations,
  isNull,
  like,
  seatAssignments,
  seatingTables,
  sql,
  user,
  type Database,
} from "@casamento/db";
import {
  CHECKIN_RECENT_LIMIT,
  CHECKIN_SEARCH_MAX_RESULTS,
  type CheckinArrivalView,
  type CheckinInvitationView,
  type CheckinLinkView,
  type CheckinRecentArrival,
  type CheckinTotals,
} from "@casamento/shared";
import type { EventCtx } from "../tenancy/types.ts";
import { invitationRef, readInvitationRef } from "./crypto.ts";

/*
 * Fase 7, frente A: chegadas e busca do check-in, usadas pelo painel e pela portaria. Tudo
 * filtrado pelo evento (`byEvent`). A portaria vê só nome do convite, pessoas confirmadas,
 * adulto/criança, mesa e aviso de acesso — nada de telefone, e-mail ou restrição alimentar.
 */

type LinkRow = typeof checkinLinks.$inferSelect;

/** Quem marca: um link da portaria ou uma pessoa do painel. */
export type CheckinActor = { linkId: number } | { userId: string };

export function linkStatus(link: LinkRow, now: Date): CheckinLinkView["status"] {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

export function linkView(link: LinkRow, now: Date): CheckinLinkView {
  const locked = link.lockedUntil && link.lockedUntil.getTime() > now.getTime();
  return {
    id: link.id,
    label: link.label,
    expiresAt: link.expiresAt.toISOString(),
    revokedAt: link.revokedAt?.toISOString() ?? null,
    lastUsedAt: link.lastUsedAt?.toISOString() ?? null,
    lockedUntil: locked ? link.lockedUntil!.toISOString() : null,
    createdAt: link.createdAt.toISOString(),
    status: linkStatus(link, now),
  };
}

export async function listLinks(ev: EventCtx, db: Database, now: Date) {
  const rows = await db
    .select()
    .from(checkinLinks)
    .where(byEvent(checkinLinks, ev))
    .orderBy(desc(checkinLinks.createdAt), desc(checkinLinks.id));
  const views = rows.map((r) => linkView(r, now));
  // Ativos primeiro; dentro do grupo, os mais novos.
  return [
    ...views.filter((l) => l.status === "active"),
    ...views.filter((l) => l.status !== "active"),
  ];
}

export async function totals(ev: EventCtx, db: Database): Promise<CheckinTotals> {
  const [expected] = await db
    .select({
      people: sql<number>`count(*)`.mapWith(Number),
      invitations: sql<number>`count(distinct ${guests.invitationId})`.mapWith(Number),
    })
    .from(guests)
    .where(and(byEvent(guests, ev), eq(guests.rsvpStatus, "confirmed")));
  const [arrived] = await db
    .select({
      people: sql<number>`coalesce(sum(${checkins.people}), 0)`.mapWith(Number),
      invitations: sql<number>`count(distinct ${checkins.invitationId})`.mapWith(Number),
    })
    .from(checkins)
    .where(and(byEvent(checkins, ev), isNull(checkins.undoneAt)));
  return {
    expectedPeople: expected?.people ?? 0,
    arrivedPeople: arrived?.people ?? 0,
    expectedInvitations: expected?.invitations ?? 0,
    arrivedInvitations: arrived?.invitations ?? 0,
  };
}

/** Marcações com quem marcou ("Portaria principal" ou o nome de quem usou o painel). */
async function arrivalRows(
  ev: EventCtx,
  db: Database,
  where: ReturnType<typeof and>,
  limit?: number,
) {
  const q = db
    .select({
      id: checkins.id,
      invitationId: checkins.invitationId,
      people: checkins.people,
      createdAt: checkins.createdAt,
      undoneAt: checkins.undoneAt,
      linkLabel: checkinLinks.label,
      userName: user.name,
    })
    .from(checkins)
    .leftJoin(
      checkinLinks,
      and(eq(checkinLinks.id, checkins.checkinLinkId), byEvent(checkinLinks, ev)),
    )
    .leftJoin(user, eq(user.id, checkins.userId))
    .where(and(byEvent(checkins, ev), where))
    .orderBy(desc(checkins.createdAt), desc(checkins.id));
  return limit ? q.limit(limit) : q;
}

type ArrivalRow = Awaited<ReturnType<typeof arrivalRows>>[number];

const arrivalView = (r: ArrivalRow): CheckinArrivalView => ({
  id: r.id,
  people: r.people,
  at: r.createdAt.toISOString(),
  by: r.linkLabel ?? r.userName ?? "Painel",
  undoneAt: r.undoneAt?.toISOString() ?? null,
});

/** Monta a visão dos convites (na ordem dos ids recebidos). */
async function invitationViews(
  ev: EventCtx,
  db: Database,
  secret: string,
  ids: number[],
): Promise<CheckinInvitationView[]> {
  if (ids.length === 0) return [];
  const invs = await db
    .select({ id: invitations.id, label: invitations.label, accessNote: invitations.accessNote })
    .from(invitations)
    .where(and(byEvent(invitations, ev), inArray(invitations.id, ids)));
  const people = await db
    .select({
      invitationId: guests.invitationId,
      name: guests.name,
      isChild: guests.isChild,
      table: seatingTables.name,
    })
    .from(guests)
    .leftJoin(
      seatAssignments,
      and(eq(seatAssignments.guestId, guests.id), byEvent(seatAssignments, ev)),
    )
    .leftJoin(
      seatingTables,
      and(eq(seatingTables.id, seatAssignments.tableId), byEvent(seatingTables, ev)),
    )
    .where(
      and(
        byEvent(guests, ev),
        inArray(guests.invitationId, ids),
        eq(guests.rsvpStatus, "confirmed"),
      ),
    )
    .orderBy(asc(guests.isPlusOne), asc(guests.id));
  const arrivals = await arrivalRows(ev, db, inArray(checkins.invitationId, ids));

  const byId = new Map(invs.map((i) => [i.id, i]));
  return ids.flatMap((id) => {
    const inv = byId.get(id);
    if (!inv) return [];
    const list = people.filter((p) => p.invitationId === id);
    const marks = arrivals.filter((a) => a.invitationId === id);
    return [
      {
        ref: invitationRef(secret, ev.id, id),
        label: inv.label,
        people: list.map((p) => ({ name: p.name, isChild: p.isChild, table: p.table ?? null })),
        confirmed: list.length,
        arrived: marks.filter((a) => !a.undoneAt).reduce((s, a) => s + a.people, 0),
        accessNote: inv.accessNote ?? null,
        arrivals: marks.map(arrivalView),
      },
    ];
  });
}

export async function invitationView(
  ev: EventCtx,
  db: Database,
  secret: string,
  invitationId: number,
): Promise<CheckinInvitationView | null> {
  return (await invitationViews(ev, db, secret, [invitationId]))[0] ?? null;
}

/** Convite pelo token lido no QR (só do evento; de outro evento = null → 404). */
export async function findByInvitationToken(
  ev: EventCtx,
  db: Database,
  secret: string,
  token: string,
): Promise<CheckinInvitationView | null> {
  const [row] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(byEvent(invitations, ev), eq(invitations.token, token)));
  return row ? invitationView(ev, db, secret, row.id) : null;
}

/** Busca por nome do convite ou de qualquer pessoa dele (sem acento nem caixa: collation). */
export async function searchInvitations(
  ev: EventCtx,
  db: Database,
  secret: string,
  q: string,
): Promise<CheckinInvitationView[]> {
  const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const byLabel = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(byEvent(invitations, ev), like(invitations.label, pattern)))
    .orderBy(asc(invitations.label))
    .limit(CHECKIN_SEARCH_MAX_RESULTS);
  const byGuest = await db
    .selectDistinct({ id: guests.invitationId })
    .from(guests)
    .where(and(byEvent(guests, ev), like(guests.name, pattern)))
    .limit(CHECKIN_SEARCH_MAX_RESULTS);
  const ids = [...new Set([...byLabel, ...byGuest].map((r) => r.id))].slice(
    0,
    CHECKIN_SEARCH_MAX_RESULTS,
  );
  const views = await invitationViews(ev, db, secret, ids);
  const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
  return views.sort((a, b) => collator.compare(a.label, b.label));
}

export async function recentArrivals(
  ev: EventCtx,
  db: Database,
  secret: string,
): Promise<CheckinRecentArrival[]> {
  const rows = await arrivalRows(ev, db, undefined, CHECKIN_RECENT_LIMIT);
  if (rows.length === 0) return [];
  const labels = await db
    .select({ id: invitations.id, label: invitations.label })
    .from(invitations)
    .where(
      and(
        byEvent(invitations, ev),
        inArray(invitations.id, [...new Set(rows.map((r) => r.invitationId))]),
      ),
    );
  const labelOf = new Map(labels.map((l) => [l.id, l.label]));
  return rows.map((r) => ({
    ...arrivalView(r),
    ref: invitationRef(secret, ev.id, r.invitationId),
    invitationLabel: labelOf.get(r.invitationId) ?? "",
  }));
}

/** Marca chegada (parcial ou não). null = referência inválida ou de outro evento. */
export async function markArrival(
  ev: EventCtx,
  db: Database,
  secret: string,
  input: { ref: string; people: number },
  actor: CheckinActor,
  now: Date,
): Promise<CheckinInvitationView | null> {
  const id = readInvitationRef(secret, ev.id, input.ref);
  if (id === null) return null;
  const [inv] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(byEvent(invitations, ev), eq(invitations.id, id)));
  if (!inv) return null;
  await db.insert(checkins).values({
    eventId: ev.id,
    invitationId: id,
    people: input.people,
    checkinLinkId: "linkId" in actor ? actor.linkId : null,
    userId: "userId" in actor ? actor.userId : null,
    createdAt: now,
    updatedAt: now,
  });
  return invitationView(ev, db, secret, id);
}

/** Desfaz uma marcação (não apaga: grava `undone_at`). Já desfeita = sem mudança. */
export async function undoArrival(
  ev: EventCtx,
  db: Database,
  secret: string,
  arrivalId: number,
  now: Date,
): Promise<CheckinInvitationView | null> {
  const [row] = await db
    .select({ invitationId: checkins.invitationId, undoneAt: checkins.undoneAt })
    .from(checkins)
    .where(and(byEvent(checkins, ev), eq(checkins.id, arrivalId)));
  if (!row) return null;
  if (!row.undoneAt) {
    await db
      .update(checkins)
      .set({ undoneAt: now, updatedAt: now })
      .where(and(byEvent(checkins, ev), eq(checkins.id, arrivalId), isNull(checkins.undoneAt)));
  }
  return invitationView(ev, db, secret, row.invitationId);
}

/** Link do evento por id (painel). */
export async function findLink(ev: EventCtx, db: Database, id: number) {
  const [row] = await db
    .select()
    .from(checkinLinks)
    .where(and(byEvent(checkinLinks, ev), eq(checkinLinks.id, id)));
  return row ?? null;
}
