import {
  bigint,
  boolean,
  index,
  int,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { createdAt, json, timestamps, utcDatetime } from "./columns.ts";

export const SIDES = ["dani", "gustavo"] as const;
export const RSVP_STATUSES = ["pending", "confirmed", "declined"] as const;
export const AGE_RANGES = ["0-2", "3-7", "8-12"] as const;
export const ORDER_STATUSES = ["pending", "paid", "expired", "failed", "refunded"] as const;
export const PAYMENT_METHODS = ["pix", "card"] as const;
/** Provedor de pagamento: "simulado" em dev (sem credenciais) ou "asaas". */
export const PAYMENT_PROVIDERS = ["simulado", "asaas"] as const;

export type Side = (typeof SIDES)[number];
export type RsvpStatus = (typeof RSVP_STATUSES)[number];
export type AgeRange = (typeof AGE_RANGES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

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
  /** Contato do grupo para o e-mail de confirmação e para os noivos. Preenchido no RSVP. */
  contactEmail: varchar("contact_email", { length: 191 }),
  contactPhone: varchar("contact_phone", { length: 32 }),
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
    /** Acompanhante (+1) criado pelo próprio convidado no RSVP. */
    isPlusOne: boolean("is_plus_one").notNull().default(false),
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
    /** Valor do presente (cotas × preço, ou o valor livre), sem a taxa. */
    amountCents: int("amount_cents").notNull(),
    /** Taxa do cartão somada ao valor quando o convidado escolhe cobri-la. */
    feeCents: int("fee_cents").notNull().default(0),
    feeCovered: boolean("fee_covered").notNull().default(false),
    /** Forma de pagamento atual: começa em Pix e vira "card" se o cartão for aprovado. */
    method: mysqlEnum("method", PAYMENT_METHODS).notNull().default("pix"),
    provider: mysqlEnum("provider", PAYMENT_PROVIDERS).notNull().default("simulado"),
    /** Id da cobrança no provedor (pay_… no Asaas): a do Pix, ou a do cartão aprovado. */
    providerOrderId: varchar("provider_order_id", { length: 128 }).unique(),
    /** Status detalhado do provedor (ex.: waiting_transfer, accredited, expired). */
    statusDetail: varchar("status_detail", { length: 64 }),
    /** Pix copia e cola. */
    pixCode: text("pix_code"),
    /** Imagem do QR em PNG base64 (o Asaas gera; no simulado fica vazia). */
    pixQrBase64: mediumtext("pix_qr_base64"),
    pixTicketUrl: varchar("pix_ticket_url", { length: 255 }),
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
    gateway: varchar("gateway", { length: 32 }).notNull().default("simulado"),
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
  gateway: varchar("gateway", { length: 32 }).notNull().default("simulado"),
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
    /** Recado que veio junto de um presente pago (vazio quando escrito no mural). */
    giftOrderId: fk("gift_order_id")
      .unique()
      .references(() => giftOrders.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [index("messages_approved_idx").on(t.approved)],
);

/**
 * Lembretes de RSVP já enviados. A chave única (convite, tipo) impede o mesmo lembrete de
 * sair duas vezes: o tipo é "auto:14" (14 dias antes do prazo) ou "manual:2027-02-20".
 */
export const rsvpReminders = mysqlTable(
  "rsvp_reminders",
  {
    id: pk(),
    invitationId: fk("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    sentAt: createdAt(),
  },
  (t) => [uniqueIndex("rsvp_reminders_invitation_kind_idx").on(t.invitationId, t.kind)],
);

export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: json<unknown>("value").notNull(),
  /** Se pode aparecer em GET /api/site. */
  isPublic: boolean("is_public").notNull().default(true),
  ...timestamps(),
});
