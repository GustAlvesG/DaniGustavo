import {
  bigint,
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  varchar,
} from "drizzle-orm/mysql-core";
import { createdAt, json, timestamps, utcDatetime } from "./columns.ts";

export const SIDES = ["dani", "gustavo"] as const;
export const RSVP_STATUSES = ["pending", "confirmed", "declined"] as const;
export const AGE_RANGES = ["0-2", "3-7", "8-12"] as const;
export const ORDER_STATUSES = ["pending", "paid", "expired", "failed", "refunded"] as const;
export const PAYMENT_METHODS = ["pix", "card"] as const;

export type Side = (typeof SIDES)[number];
export type RsvpStatus = (typeof RSVP_STATUSES)[number];
export type AgeRange = (typeof AGE_RANGES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Chave primária BIGINT UNSIGNED AUTO_INCREMENT. Não usamos `serial`: o drizzle-kit gera
// "serial AUTO_INCREMENT", que o MariaDB 10.4 rejeita.
const pk = () => bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey();
// FK para essas chaves.
const fk = (name: string) => bigint(name, { mode: "number", unsigned: true });

export const invitations = mysqlTable("invitations", {
  id: pk(),
  /** ULID aleatório usado no link do convite. Nunca expor o `id`. */
  token: varchar("token", { length: 26 }).notNull().unique(),
  label: varchar("label", { length: 191 }).notNull(),
  maxGuests: int("max_guests").notNull().default(1),
  side: mysqlEnum("side", SIDES).notNull(),
  allowPlusOne: boolean("allow_plus_one").notNull().default(false),
  sentAt: utcDatetime("sent_at"),
  ...timestamps(),
});

export const guests = mysqlTable(
  "guests",
  {
    id: pk(),
    invitationId: fk("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 191 }).notNull(),
    isChild: boolean("is_child").notNull().default(false),
    /** Faixa etária, só para crianças. */
    ageRange: mysqlEnum("age_range", AGE_RANGES),
    rsvpStatus: mysqlEnum("rsvp_status", RSVP_STATUSES).notNull().default("pending"),
    /** Dado sensível (saúde): uso apenas pelo buffet. */
    dietaryNotes: text("dietary_notes"),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 191 }),
    respondedAt: utcDatetime("responded_at"),
    ...timestamps(),
  },
  (t) => [index("guests_invitation_id_idx").on(t.invitationId)],
);

export const rsvpLogs = mysqlTable(
  "rsvp_logs",
  {
    id: pk(),
    invitationId: fk("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    payload: json<unknown>("payload").notNull(),
    ip: varchar("ip", { length: 45 }),
    createdAt: createdAt(),
  },
  (t) => [index("rsvp_logs_invitation_id_idx").on(t.invitationId)],
);

export const gifts = mysqlTable(
  "gifts",
  {
    id: pk(),
    slug: varchar("slug", { length: 191 }).notNull().unique(),
    title: varchar("title", { length: 191 }).notNull(),
    description: text("description"),
    image: varchar("image", { length: 255 }),
    /** Valor em centavos. Em presentes de valor livre, é o valor sugerido. */
    priceCents: int("price_cents").notNull(),
    /** Valor livre: o convidado escolhe quanto contribuir. */
    openAmount: boolean("open_amount").notNull().default(false),
    quotaTotal: int("quota_total").notNull().default(1),
    quotaSold: int("quota_sold").notNull().default(0),
    category: varchar("category", { length: 64 }).notNull(),
    tileDesign: varchar("tile_design", { length: 32 }).notNull(),
    active: boolean("active").notNull().default(true),
    sort: int("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("gifts_active_sort_idx").on(t.active, t.sort)],
);

export const giftOrders = mysqlTable(
  "gift_orders",
  {
    id: pk(),
    /** ULID aleatório exposto ao front. Nunca expor o `id`. */
    publicId: varchar("public_id", { length: 26 }).notNull().unique(),
    giftId: fk("gift_id")
      .notNull()
      .references(() => gifts.id, { onDelete: "restrict" }),
    quantity: int("quantity").notNull().default(1),
    amountCents: int("amount_cents").notNull(),
    feeCents: int("fee_cents").notNull().default(0),
    feeCovered: boolean("fee_covered").notNull().default(false),
    buyerName: varchar("buyer_name", { length: 191 }).notNull(),
    buyerEmail: varchar("buyer_email", { length: 191 }).notNull(),
    message: text("message"),
    showOnWall: boolean("show_on_wall").notNull().default(false),
    status: mysqlEnum("status", ORDER_STATUSES).notNull().default("pending"),
    expiresAt: utcDatetime("expires_at").notNull(),
    paidAt: utcDatetime("paid_at"),
    ...timestamps(),
  },
  (t) => [
    index("gift_orders_status_expires_idx").on(t.status, t.expiresAt),
    index("gift_orders_gift_id_idx").on(t.giftId),
  ],
);

export const payments = mysqlTable(
  "payments",
  {
    id: pk(),
    orderId: fk("order_id")
      .notNull()
      .references(() => giftOrders.id, { onDelete: "restrict" }),
    gateway: varchar("gateway", { length: 32 }).notNull().default("mercadopago"),
    gatewayId: varchar("gateway_id", { length: 128 }).notNull().unique(),
    method: mysqlEnum("method", PAYMENT_METHODS).notNull(),
    /** Status bruto do gateway (ex.: approved, pending, rejected). */
    gatewayStatus: varchar("gateway_status", { length: 32 }),
    grossCents: int("gross_cents").notNull(),
    feeCents: int("fee_cents").notNull().default(0),
    netCents: int("net_cents").notNull(),
    raw: json<unknown>("raw"),
    ...timestamps(),
  },
  (t) => [index("payments_order_id_idx").on(t.orderId)],
);

export const webhookEvents = mysqlTable("webhook_events", {
  id: pk(),
  gateway: varchar("gateway", { length: 32 }).notNull().default("mercadopago"),
  eventId: varchar("event_id", { length: 128 }).notNull().unique(),
  payload: json<unknown>("payload").notNull(),
  processedAt: utcDatetime("processed_at"),
  createdAt: createdAt(),
});

export const messages = mysqlTable(
  "messages",
  {
    id: pk(),
    author: varchar("author", { length: 120 }).notNull(),
    body: text("body").notNull(),
    approved: boolean("approved").notNull().default(false),
    ...timestamps(),
  },
  (t) => [index("messages_approved_idx").on(t.approved)],
);

export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: json<unknown>("value").notNull(),
  /** Se pode aparecer em GET /api/site. */
  isPublic: boolean("is_public").notNull().default(true),
  ...timestamps(),
});
