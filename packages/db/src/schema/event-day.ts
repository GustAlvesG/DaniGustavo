import {
  foreignKey,
  index,
  int,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { guests, invitations } from "./app.ts";
import { user } from "./auth.ts";
import { fk, pk, timestamps, utcDatetime } from "./columns.ts";
import { eventVendors } from "./planning.ts";
import { events } from "./tenancy.ts";

/*
 * Fase 7 (docs/saas/fase-7.md): o dia do evento — check-in pela portaria (link + PIN), mapa de
 * mesas, portal do fornecedor (link mágico) e WhatsApp por links prontos. Migration 0013.
 *
 * Tudo é dado do evento (`event_id`, auditor estrito). Tokens de link só como SHA-256 (hex);
 * o PIN da portaria só como hash scrypt (`node:crypto`, sem dependência). Links públicos são
 * achados pelo hash do token dentro de `crossEvent(...)`; dali em diante tudo filtra pelo
 * evento do link.
 */

const eventId = () =>
  fk("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" });

const createdBy = () =>
  varchar("created_by", { length: 36 }).references(() => user.id, { onDelete: "set null" });

/* ------------------------------------------------------------------------ */
/* Check-in (frente A)                                                       */
/* ------------------------------------------------------------------------ */

/**
 * Link da portaria: `/portaria/#<token>` + PIN, sem conta. A organização gera (o token e o PIN
 * aparecem uma vez) e revoga. Bloqueio por tentativas erradas de PIN em `pin_failures` /
 * `locked_until` (além do rate limit por IP).
 */
export const checkinLinks = mysqlTable(
  "checkin_links",
  {
    id: pk(),
    eventId: eventId(),
    /** Nome para a equipe ("Portaria principal", "Entrada lateral"). */
    label: varchar("label", { length: 64 }).notNull(),
    /** SHA-256 (hex) do token do link. */
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    /** Hash scrypt do PIN ("scrypt$<salt hex>$<hash hex>"). */
    pinHash: varchar("pin_hash", { length: 191 }).notNull(),
    pinFailures: int("pin_failures").notNull().default(0),
    lockedUntil: utcDatetime("locked_until"),
    expiresAt: utcDatetime("expires_at").notNull(),
    revokedAt: utcDatetime("revoked_at"),
    lastUsedAt: utcDatetime("last_used_at"),
    createdBy: createdBy(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("checkin_links_event_id_id_idx").on(t.eventId, t.id)],
);

/**
 * Chegadas: uma linha por marcação (parcial ou do convite inteiro). Chegaram = soma de `people`
 * das linhas sem `undone_at`. Quem marcou: link da portaria (`checkin_link_id`, sem FK: links
 * só são revogados, nunca apagados) ou pessoa do painel (`user_id`).
 */
export const checkins = mysqlTable(
  "checkins",
  {
    id: pk(),
    eventId: fk("event_id").notNull(),
    invitationId: fk("invitation_id").notNull(),
    /** Quantas pessoas do convite chegaram nesta marcação (≥ 1). */
    people: int("people").notNull(),
    checkinLinkId: fk("checkin_link_id"),
    userId: varchar("user_id", { length: 36 }).references(() => user.id, {
      onDelete: "set null",
    }),
    undoneAt: utcDatetime("undone_at"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("checkins_event_id_id_idx").on(t.eventId, t.id),
    index("checkins_event_invitation_idx").on(t.eventId, t.invitationId),
    index("checkins_event_created_idx").on(t.eventId, t.createdAt),
    foreignKey({
      name: "checkins_invitation_fk",
      columns: [t.eventId, t.invitationId],
      foreignColumns: [invitations.eventId, invitations.id],
    }).onDelete("cascade"),
  ],
);

/* ------------------------------------------------------------------------ */
/* Mapa de mesas (frente B)                                                  */
/* ------------------------------------------------------------------------ */

export const seatingTables = mysqlTable(
  "seating_tables",
  {
    id: pk(),
    eventId: eventId(),
    name: varchar("name", { length: 64 }).notNull(),
    /** Lugares da mesa (aviso de lotação acima disso; não bloqueia). */
    seats: int("seats").notNull().default(8),
    sort: int("sort").notNull().default(0),
    /** Lado do evento (`event.sides`) a que a mesa se destina; nulo = qualquer. */
    side: varchar("side", { length: 32 }),
    /** Grupo livre ("Família da noiva", "Amigos da faculdade"). */
    groupLabel: varchar("group_label", { length: 64 }),
    notes: varchar("notes", { length: 300 }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("seating_tables_event_id_id_idx").on(t.eventId, t.id),
    index("seating_tables_event_sort_idx").on(t.eventId, t.sort),
  ],
);

/** Pessoa (linha de `guests`) numa mesa; uma mesa por pessoa no evento. */
export const seatAssignments = mysqlTable(
  "seat_assignments",
  {
    id: pk(),
    eventId: fk("event_id").notNull(),
    tableId: fk("table_id").notNull(),
    guestId: fk("guest_id").notNull(),
    /** Número do lugar na mesa (opcional). */
    seat: int("seat"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("seat_assignments_event_guest_idx").on(t.eventId, t.guestId),
    uniqueIndex("seat_assignments_event_table_seat_idx").on(t.eventId, t.tableId, t.seat),
    foreignKey({
      name: "seat_assignments_table_fk",
      columns: [t.eventId, t.tableId],
      foreignColumns: [seatingTables.eventId, seatingTables.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "seat_assignments_guest_fk",
      columns: [t.eventId, t.guestId],
      foreignColumns: [guests.eventId, guests.id],
    }).onDelete("cascade"),
  ],
);

/* ------------------------------------------------------------------------ */
/* Portal do fornecedor (frente C)                                           */
/* ------------------------------------------------------------------------ */

/**
 * Link mágico do fornecedor do evento (`/fornecedor/#<token>`), enviado por e-mail. Vale até
 * `expires_at` e pode ser usado várias vezes; revogável. O token só como SHA-256.
 */
export const vendorPortalLinks = mysqlTable(
  "vendor_portal_links",
  {
    id: pk(),
    eventId: fk("event_id").notNull(),
    eventVendorId: fk("event_vendor_id").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    /** E-mail para onde o link foi enviado. */
    email: varchar("email", { length: 191 }).notNull(),
    expiresAt: utcDatetime("expires_at").notNull(),
    revokedAt: utcDatetime("revoked_at"),
    lastUsedAt: utcDatetime("last_used_at"),
    createdBy: createdBy(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("vendor_portal_links_event_id_id_idx").on(t.eventId, t.id),
    index("vendor_portal_links_event_vendor_idx").on(t.eventId, t.eventVendorId),
    foreignKey({
      name: "vendor_portal_links_vendor_fk",
      columns: [t.eventId, t.eventVendorId],
      foreignColumns: [eventVendors.eventId, eventVendors.id],
    }).onDelete("cascade"),
  ],
);

/* ------------------------------------------------------------------------ */
/* WhatsApp (frente D)                                                       */
/* ------------------------------------------------------------------------ */

/**
 * Modelo de mensagem do evento por tipo (`WHATSAPP_TEMPLATE_KINDS` em @casamento/shared ›
 * whatsapp). Sem linha = texto padrão do tipo.
 */
export const whatsappTemplates = mysqlTable(
  "whatsapp_templates",
  {
    id: pk(),
    eventId: eventId(),
    kind: varchar("kind", { length: 32 }).notNull(),
    body: text("body").notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("whatsapp_templates_event_kind_idx").on(t.eventId, t.kind)],
);

/**
 * "Enviado" marcado pelo organizador depois de abrir o wa.me (a plataforma não sabe se a
 * mensagem saiu de fato). Sem telefone nem texto: só convite, tipo e quando.
 */
export const whatsappSends = mysqlTable(
  "whatsapp_sends",
  {
    id: pk(),
    eventId: fk("event_id").notNull(),
    invitationId: fk("invitation_id").notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    markedBy: varchar("marked_by", { length: 36 }).references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => [
    index("whatsapp_sends_event_kind_inv_idx").on(t.eventId, t.kind, t.invitationId),
    foreignKey({
      name: "whatsapp_sends_invitation_fk",
      columns: [t.eventId, t.invitationId],
      foreignColumns: [invitations.eventId, invitations.id],
    }).onDelete("cascade"),
  ],
);
