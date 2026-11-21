import {
  and,
  asc,
  byEvent,
  eq,
  guests,
  inArray,
  invitations,
  whatsappSends,
  whatsappTemplates,
  type Database,
} from "@casamento/db";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  renderWhatsappTemplate,
  WHATSAPP_TEMPLATE_KINDS,
  WHATSAPP_TEMPLATE_LABELS,
  waLink,
  waPhone,
  type WhatsappQueueFilter,
  type WhatsappQueueItem,
  type WhatsappQueueResponse,
  type WhatsappTemplateKind,
  type WhatsappTemplateView,
} from "@casamento/shared";
import { invitationLink, invitationStatus } from "../admin/invitations.ts";
import { readSetting } from "../admin/event-settings.ts";
import type { EventCtx } from "../tenancy/types.ts";

/*
 * Fase 7, frente D: modelos e fila do WhatsApp por links prontos (wa.me). A plataforma só monta
 * a mensagem e o link; quem envia é o organizador, pelo próprio WhatsApp, e ele marca "enviado".
 */

/** Modelos do evento: o texto gravado ou o padrão do tipo. */
export async function loadTemplates(ev: EventCtx, db: Database): Promise<WhatsappTemplateView[]> {
  const rows = await db.select().from(whatsappTemplates).where(byEvent(whatsappTemplates, ev));
  const byKind = new Map(rows.map((r) => [r.kind, r.body]));
  return WHATSAPP_TEMPLATE_KINDS.map((kind) => {
    const body = byKind.get(kind)?.trim();
    return {
      kind,
      label: WHATSAPP_TEMPLATE_LABELS[kind],
      body: body || DEFAULT_WHATSAPP_TEMPLATES[kind],
      isDefault: !body,
    };
  });
}

/** Grava o modelo; texto vazio apaga a linha (volta ao padrão). */
export async function saveTemplate(
  ev: EventCtx,
  db: Database,
  kind: WhatsappTemplateKind,
  body: string,
): Promise<WhatsappTemplateView> {
  const text = body.trim();
  if (!text) {
    await db
      .delete(whatsappTemplates)
      .where(and(byEvent(whatsappTemplates, ev), eq(whatsappTemplates.kind, kind)));
  } else {
    await db
      .insert(whatsappTemplates)
      .values({ eventId: ev.id, kind, body: text })
      .onDuplicateKeyUpdate({ set: { body: text, updatedAt: new Date() } });
  }
  const all = await loadTemplates(ev, db);
  return all.find((t) => t.kind === kind)!;
}

const dateOnly = (value: Date, timeZone: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone }).format(value);

/** Textos de data do evento e do prazo do RSVP no fuso do evento. */
async function eventDates(ev: EventCtx, db: Database) {
  const [datetime, deadline] = await Promise.all([
    readSetting(ev, db, "wedding.datetime"),
    readSetting(ev, db, "rsvp.deadline"),
  ]);
  const eventDate = typeof datetime === "string" ? new Date(datetime) : ev.startsAt;
  const valid = (d: Date | null | undefined): d is Date => !!d && !Number.isNaN(d.getTime());
  const deadlineDate = typeof deadline === "string" ? new Date(deadline) : null;
  const date = valid(eventDate) ? dateOnly(eventDate, ev.timezone) : "";
  return {
    date,
    deadline: valid(deadlineDate) ? dateOnly(deadlineDate, ev.timezone) : date,
  };
}

/**
 * Fila de envio de um tipo. `filter`: `not_sent` (ainda sem marca deste tipo), `pending_rsvp`
 * (sem resposta), `confirmed`, `all`. Convites anonimizados ficam de fora. Sem telefone
 * válido o item vem com `waUrl: null` (o painel pula) e entra em `withoutPhone`.
 */
export async function buildQueue(
  ev: EventCtx,
  db: Database,
  baseUrl: string,
  kind: WhatsappTemplateKind,
  filter: WhatsappQueueFilter,
): Promise<WhatsappQueueResponse> {
  const [templates, invs, guestRows, sends, dates] = await Promise.all([
    loadTemplates(ev, db),
    db.select().from(invitations).where(byEvent(invitations, ev)).orderBy(asc(invitations.label)),
    db.select().from(guests).where(byEvent(guests, ev)).orderBy(asc(guests.id)),
    db
      .select()
      .from(whatsappSends)
      .where(and(byEvent(whatsappSends, ev), eq(whatsappSends.kind, kind)))
      .orderBy(asc(whatsappSends.id)),
    eventDates(ev, db),
  ]);
  const body = templates.find((t) => t.kind === kind)!.body;

  const guestsOf = new Map<number, typeof guestRows>();
  for (const g of guestRows) {
    const list = guestsOf.get(g.invitationId) ?? [];
    list.push(g);
    guestsOf.set(g.invitationId, list);
  }
  const sendsOf = new Map<number, typeof sends>();
  for (const s of sends) {
    const list = sendsOf.get(s.invitationId) ?? [];
    list.push(s);
    sendsOf.set(s.invitationId, list);
  }

  const items: WhatsappQueueItem[] = [];
  let withoutPhone = 0;
  for (const inv of invs) {
    if (inv.anonymizedAt) continue;
    const list = guestsOf.get(inv.id) ?? [];
    const status = invitationStatus(list);
    const done = sendsOf.get(inv.id) ?? [];
    if (filter === "not_sent" && done.length > 0) continue;
    if (filter === "pending_rsvp" && status !== "pending") continue;
    if (filter === "confirmed" && status !== "confirmed") continue;

    const phone =
      waPhone(inv.contactPhone) ??
      list.map((g) => waPhone(g.phone)).find((p) => p !== null) ??
      null;
    const message = renderWhatsappTemplate(body, {
      convite: inv.label,
      evento: ev.name,
      data: dates.date,
      link: invitationLink(baseUrl, inv.token),
      prazo: dates.deadline,
    });
    const last = done.at(-1);
    if (!phone) withoutPhone += 1;
    items.push({
      invitationId: inv.id,
      label: inv.label,
      phone,
      waUrl: phone ? waLink(phone, message) : null,
      message,
      lastSentAt: last ? last.createdAt.toISOString() : null,
      lastSendId: last ? last.id : null,
      sends: done.length,
    });
  }
  return { kind, items, withoutPhone };
}

/** Marca "enviado" para os convites (todos do evento ou nenhum: id de outro evento → null). */
export async function markSent(
  ev: EventCtx,
  db: Database,
  userId: string,
  kind: WhatsappTemplateKind,
  invitationIds: number[],
): Promise<number | null> {
  const ids = [...new Set(invitationIds)];
  const found = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(byEvent(invitations, ev), inArray(invitations.id, ids)));
  if (found.length !== ids.length) return null;
  await db
    .insert(whatsappSends)
    .values(ids.map((invitationId) => ({ eventId: ev.id, invitationId, kind, markedBy: userId })));
  return ids.length;
}

/** Desfaz uma marcação; false = não existe neste evento. */
export async function unmarkSent(ev: EventCtx, db: Database, sendId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: whatsappSends.id })
    .from(whatsappSends)
    .where(and(byEvent(whatsappSends, ev), eq(whatsappSends.id, sendId)));
  if (!row) return false;
  await db
    .delete(whatsappSends)
    .where(and(byEvent(whatsappSends, ev), eq(whatsappSends.id, sendId)));
  return true;
}
