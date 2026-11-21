import {
  and,
  asc,
  byEvent,
  eq,
  giftOrders,
  gifts,
  guests,
  inArray,
  invitations,
  messages,
  privacyRequests,
  type Database,
} from "@casamento/db";
import { toCsv } from "../admin/invitations.ts";
import type { EventCtx } from "../tenancy/types.ts";

/*
 * Exportação dos dados pessoais de um evento (Fase 6, LGPD): o evento inteiro (para a equipe,
 * antes de apagar ou para guardar) ou só os convites/pedidos de um titular (pedido de acesso).
 * Nunca entram segredos nem ids do provedor de pagamento: token do convite (é a chave do link),
 * id da cobrança, Pix copia e cola, payload bruto, IP.
 */

export interface ExportFilter {
  invitationIds?: number[];
  orderIds?: number[];
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export interface EventDataExport {
  exportedAt: string;
  event: { name: string; slug: string; type: string; startsAt: string | null };
  scope: "event" | "subject";
  invitations: {
    id: number;
    label: string;
    side: string;
    maxGuests: number;
    contactEmail: string | null;
    contactPhone: string | null;
    consentAt: string | null;
    consentVersion: string | null;
    anonymizedAt: string | null;
    createdAt: string;
    guests: {
      name: string;
      isChild: boolean;
      ageRange: string | null;
      isPlusOne: boolean;
      rsvpStatus: string;
      dietaryNotes: string | null;
      email: string | null;
      phone: string | null;
      respondedAt: string | null;
    }[];
  }[];
  orders: {
    id: number;
    publicId: string;
    gift: string;
    quantity: number;
    amountCents: number;
    feeCents: number;
    method: string;
    status: string;
    buyerName: string;
    buyerEmail: string;
    message: string | null;
    createdAt: string;
    paidAt: string | null;
    anonymizedAt: string | null;
  }[];
  messages: {
    author: string;
    body: string;
    approved: boolean;
    consentAt: string | null;
    consentVersion: string | null;
    createdAt: string;
  }[];
  privacyRequests: {
    kind: string;
    name: string;
    email: string;
    message: string | null;
    status: string;
    response: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }[];
}

export async function exportEventData(
  ev: EventCtx,
  db: Database,
  now: Date,
  filter: ExportFilter = {},
): Promise<EventDataExport> {
  const subject = filter.invitationIds !== undefined || filter.orderIds !== undefined;
  const invIds = filter.invitationIds ?? [];
  const orderIds = filter.orderIds ?? [];

  const invRows =
    subject && invIds.length === 0
      ? []
      : await db
          .select()
          .from(invitations)
          .where(
            subject
              ? and(byEvent(invitations, ev), inArray(invitations.id, invIds))
              : byEvent(invitations, ev),
          )
          .orderBy(asc(invitations.id));
  const guestRows =
    invRows.length === 0
      ? []
      : await db
          .select()
          .from(guests)
          .where(
            and(
              byEvent(guests, ev),
              inArray(
                guests.invitationId,
                invRows.map((i) => i.id),
              ),
            ),
          )
          .orderBy(asc(guests.isPlusOne), asc(guests.id));

  const orderRows =
    subject && orderIds.length === 0
      ? []
      : await db
          .select({ order: giftOrders, gift: gifts.title })
          .from(giftOrders)
          .innerJoin(
            gifts,
            and(eq(gifts.id, giftOrders.giftId), eq(gifts.eventId, giftOrders.eventId)),
          )
          .where(
            subject
              ? and(byEvent(giftOrders, ev), inArray(giftOrders.id, orderIds))
              : byEvent(giftOrders, ev),
          )
          .orderBy(asc(giftOrders.id));

  const messageRows = subject
    ? orderRows.length === 0
      ? []
      : await db
          .select()
          .from(messages)
          .where(
            and(
              byEvent(messages, ev),
              inArray(
                messages.giftOrderId,
                orderRows.map((o) => o.order.id),
              ),
            ),
          )
    : await db.select().from(messages).where(byEvent(messages, ev)).orderBy(asc(messages.id));

  const requestRows = subject
    ? []
    : await db
        .select()
        .from(privacyRequests)
        .where(byEvent(privacyRequests, ev))
        .orderBy(asc(privacyRequests.id));

  return {
    exportedAt: now.toISOString(),
    event: { name: ev.name, slug: ev.slug, type: ev.type, startsAt: iso(ev.startsAt) },
    scope: subject ? "subject" : "event",
    invitations: invRows.map((inv) => ({
      id: inv.id,
      label: inv.label,
      side: inv.side,
      maxGuests: inv.maxGuests,
      contactEmail: inv.contactEmail,
      contactPhone: inv.contactPhone,
      consentAt: iso(inv.consentAt),
      consentVersion: inv.consentVersion,
      anonymizedAt: iso(inv.anonymizedAt),
      createdAt: inv.createdAt.toISOString(),
      guests: guestRows
        .filter((g) => g.invitationId === inv.id)
        .map((g) => ({
          name: g.name,
          isChild: g.isChild,
          ageRange: g.ageRange,
          isPlusOne: g.isPlusOne,
          rsvpStatus: g.rsvpStatus,
          dietaryNotes: g.dietaryNotes,
          email: g.email,
          phone: g.phone,
          respondedAt: iso(g.respondedAt),
        })),
    })),
    orders: orderRows.map(({ order: o, gift }) => ({
      id: o.id,
      publicId: o.publicId,
      gift,
      quantity: o.quantity,
      amountCents: o.amountCents,
      feeCents: o.feeCents,
      method: o.method,
      status: o.status,
      buyerName: o.buyerName,
      buyerEmail: o.buyerEmail,
      message: o.message,
      createdAt: o.createdAt.toISOString(),
      paidAt: iso(o.paidAt),
      anonymizedAt: iso(o.anonymizedAt),
    })),
    messages: messageRows.map((m) => ({
      author: m.author,
      body: m.body,
      approved: m.approved,
      consentAt: iso(m.consentAt),
      consentVersion: m.consentVersion,
      createdAt: m.createdAt.toISOString(),
    })),
    privacyRequests: requestRows.map((r) => ({
      kind: r.kind,
      name: r.name,
      email: r.email,
      message: r.message,
      status: r.status,
      response: r.response,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: iso(r.resolvedAt),
    })),
  };
}

const RSVP_LABEL: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  declined: "Não vai",
};

/** Uma linha por convidado (e uma por pedido), no CSV do Excel brasileiro. */
export function exportToCsv(data: EventDataExport): string {
  const rows: (string | number | null)[][] = [
    [
      "Tipo",
      "Convite",
      "Lado",
      "Nome",
      "Criança",
      "Acompanhante",
      "Resposta",
      "Restrição alimentar",
      "E-mail",
      "Telefone",
      "Respondido em",
      "Aceite do aviso",
      "Versão do aviso",
      "Presente",
      "Valor (R$)",
      "Status do pedido",
      "Recado",
      "Criado em",
    ],
  ];
  for (const inv of data.invitations) {
    for (const g of inv.guests) {
      rows.push([
        "Convidado",
        inv.label,
        inv.side,
        g.name,
        g.isChild ? "Sim" : "Não",
        g.isPlusOne ? "Sim" : "Não",
        RSVP_LABEL[g.rsvpStatus] ?? g.rsvpStatus,
        g.dietaryNotes,
        g.email ?? inv.contactEmail,
        g.phone ?? inv.contactPhone,
        g.respondedAt,
        inv.consentAt,
        inv.consentVersion,
        null,
        null,
        null,
        null,
        inv.createdAt,
      ]);
    }
  }
  for (const o of data.orders) {
    rows.push([
      "Pedido",
      null,
      null,
      o.buyerName,
      null,
      null,
      null,
      null,
      o.buyerEmail,
      null,
      null,
      null,
      null,
      o.gift,
      ((o.amountCents + o.feeCents) / 100).toFixed(2).replace(".", ","),
      o.status,
      o.message,
      o.createdAt,
    ]);
  }
  return toCsv(rows);
}
