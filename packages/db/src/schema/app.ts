import {
  boolean,
  foreignKey,
  index,
  int,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { createdAt, fk, json, pk, timestamps, utcDatetime } from "./columns.ts";
import { events } from "./tenancy.ts";

/**
 * Lados do evento 1 (casamento). Desde a migration 0008 a coluna `invitations.side` é varchar:
 * cada evento define seus lados em `event_settings` › `event.sides` ([{ key, label }]).
 * TODO(fase2-D): o tipo `Side` vira `string` (chave do lado) quando a frente D trocar os usos.
 */
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

/**
 * Evento dono da linha. Repetido nas tabelas filhas de propósito (filtro direto, sem join).
 * Sem DEFAULT: todo insert informa o evento (a migration 0007 removeu o 1 provisório).
 */
const eventId = (onDelete: "cascade" | "restrict") =>
  fk("event_id")
    .notNull()
    .references(() => events.id, { onDelete });

export const invitations = mysqlTable(
  "invitations",
  {
    id: pk(),
    eventId: eventId("cascade"),
    /** ULID aleatório usado no link do convite. Nunca expor o `id`. */
    token: varchar("token", { length: 26 }).notNull().unique(),
    label: varchar("label", { length: 191 }).notNull(),
    maxGuests: int("max_guests").notNull().default(1),
    /** Chave de um dos lados do evento (`event.sides`); "dani"/"gustavo" no evento 1. */
    side: varchar("side", { length: 32 }).$type<Side>().notNull(),
    allowPlusOne: boolean("allow_plus_one").notNull().default(false),
    /** Contato do grupo para o e-mail de confirmação e para os noivos. Preenchido no RSVP. */
    contactEmail: varchar("contact_email", { length: 191 }),
    contactPhone: varchar("contact_phone", { length: 32 }),
    sentAt: utcDatetime("sent_at"),
    ...timestamps(),
  },
  // (event_id, id) único: alvo das FKs compostas das tabelas filhas.
  (t) => [uniqueIndex("invitations_event_id_id_idx").on(t.eventId, t.id)],
);

export const guests = mysqlTable(
  "guests",
  {
    id: pk(),
    eventId: eventId("cascade"),
    invitationId: fk("invitation_id").notNull(),
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
  (t) => [
    index("guests_event_invitation_idx").on(t.eventId, t.invitationId),
    // Convidado e convite sempre do mesmo evento.
    foreignKey({
      name: "guests_invitation_fk",
      columns: [t.eventId, t.invitationId],
      foreignColumns: [invitations.eventId, invitations.id],
    }).onDelete("cascade"),
  ],
);

export const rsvpLogs = mysqlTable(
  "rsvp_logs",
  {
    id: pk(),
    eventId: eventId("cascade"),
    invitationId: fk("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    payload: json<unknown>("payload").notNull(),
    ip: varchar("ip", { length: 45 }),
    createdAt: createdAt(),
  },
  (t) => [
    index("rsvp_logs_invitation_id_idx").on(t.invitationId),
    index("rsvp_logs_event_id_idx").on(t.eventId),
  ],
);

export const gifts = mysqlTable(
  "gifts",
  {
    id: pk(),
    eventId: eventId("cascade"),
    slug: varchar("slug", { length: 191 }).notNull(),
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
  (t) => [
    uniqueIndex("gifts_event_id_id_idx").on(t.eventId, t.id),
    uniqueIndex("gifts_event_slug_idx").on(t.eventId, t.slug),
    index("gifts_event_active_sort_idx").on(t.eventId, t.active, t.sort),
  ],
);

export const giftOrders = mysqlTable(
  "gift_orders",
  {
    id: pk(),
    /** ULID aleatório exposto ao front. Nunca expor o `id`. */
    publicId: varchar("public_id", { length: 26 }).notNull().unique(),
    eventId: eventId("restrict"),
    giftId: fk("gift_id").notNull(),
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
    index("gift_orders_event_status_created_idx").on(t.eventId, t.status, t.createdAt),
    index("gift_orders_event_gift_idx").on(t.eventId, t.giftId),
    uniqueIndex("gift_orders_event_id_id_idx").on(t.eventId, t.id),
    foreignKey({
      name: "gift_orders_gift_fk",
      columns: [t.eventId, t.giftId],
      foreignColumns: [gifts.eventId, gifts.id],
    }).onDelete("restrict"),
  ],
);

export const payments = mysqlTable(
  "payments",
  {
    id: pk(),
    eventId: eventId("restrict"),
    orderId: fk("order_id").notNull(),
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
  (t) => [
    index("payments_event_order_idx").on(t.eventId, t.orderId),
    foreignKey({
      name: "payments_order_fk",
      columns: [t.eventId, t.orderId],
      foreignColumns: [giftOrders.eventId, giftOrders.id],
    }).onDelete("restrict"),
  ],
);

export const webhookEvents = mysqlTable(
  "webhook_events",
  {
    id: pk(),
    gateway: varchar("gateway", { length: 32 }).notNull().default("simulado"),
    /** Id do evento no provedor de pagamento (idempotência), não o evento da plataforma. */
    eventId: varchar("event_id", { length: 128 }).notNull().unique(),
    /**
     * Evento da plataforma a que o webhook se refere, só para auditoria (a tabela é global).
     * Não se chama `event_id` porque esse nome já é o id do evento no provedor.
     */
    appEventId: fk("app_event_id").references(() => events.id, { onDelete: "set null" }),
    payload: json<unknown>("payload").notNull(),
    processedAt: utcDatetime("processed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("webhook_events_app_event_id_idx").on(t.appEventId)],
);

export const messages = mysqlTable(
  "messages",
  {
    id: pk(),
    eventId: eventId("cascade"),
    author: varchar("author", { length: 120 }).notNull(),
    body: text("body").notNull(),
    approved: boolean("approved").notNull().default(false),
    /** Recado que veio junto de um presente pago (vazio quando escrito no mural). */
    giftOrderId: fk("gift_order_id")
      .unique()
      .references(() => giftOrders.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [index("messages_event_approved_idx").on(t.eventId, t.approved)],
);

/**
 * Lembretes de RSVP já enviados. A chave única (convite, tipo) impede o mesmo lembrete de
 * sair duas vezes: o tipo é "auto:14" (14 dias antes do prazo) ou "manual:2027-02-20".
 */
export const rsvpReminders = mysqlTable(
  "rsvp_reminders",
  {
    id: pk(),
    eventId: eventId("cascade"),
    invitationId: fk("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    sentAt: createdAt(),
  },
  (t) => [
    uniqueIndex("rsvp_reminders_invitation_kind_idx").on(t.invitationId, t.kind),
    index("rsvp_reminders_event_id_idx").on(t.eventId),
  ],
);

/** Configurações e textos de cada evento (chave/valor JSON). */
export const eventSettings = mysqlTable(
  "event_settings",
  {
    eventId: fk("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 100 }).notNull(),
    value: json<unknown>("value").notNull(),
    /** Se pode aparecer em GET /api/site. */
    isPublic: boolean("is_public").notNull().default(true),
    ...timestamps(),
  },
  (t) => [primaryKey({ name: "event_settings_pk", columns: [t.eventId, t.key] })],
);

/**
 * Fotos do evento (galeria e fotos das seções do site). Os arquivos ficam no Storage
 * (`<eventId>/<file>`, servidos em `/uploads/<eventId>/<file>`); a miniatura é gerada no
 * navegador antes do upload. Largura e altura gravadas para o site não ler o arquivo.
 */
export const eventMedia = mysqlTable(
  "event_media",
  {
    id: pk(),
    eventId: eventId("cascade"),
    /** Nome do arquivo no Storage do evento (ULID + extensão). */
    file: varchar("file", { length: 191 }).notNull(),
    /** Miniatura (largura MEDIA_THUMB_WIDTH); nula em fotos antigas sem miniatura. */
    thumbFile: varchar("thumb_file", { length: 191 }),
    mime: varchar("mime", { length: 32 }).notNull(),
    width: int("width", { unsigned: true }).notNull(),
    height: int("height", { unsigned: true }).notNull(),
    bytes: int("bytes", { unsigned: true }).notNull(),
    /** Texto alternativo (leitor de tela). */
    alt: varchar("alt", { length: 300 }).notNull().default(""),
    /** Legenda em itálico sob a polaroid (vazia = sem legenda). */
    caption: varchar("caption", { length: 300 }).notNull().default(""),
    /** Álbum dentro da galeria (ex.: "pre-wedding", "oficial"); nulo = sem álbum. */
    album: varchar("album", { length: 64 }),
    /** Parte visível no corte (CSS object-position), ex.: "center 30%". */
    position: varchar("position", { length: 40 }),
    /** Aparece na página /galeria (false = foto só usada nas seções). */
    inGallery: boolean("in_gallery").notNull().default(true),
    sort: int("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("event_media_event_id_id_idx").on(t.eventId, t.id),
    uniqueIndex("event_media_event_file_idx").on(t.eventId, t.file),
    index("event_media_event_gallery_sort_idx").on(t.eventId, t.inGallery, t.sort),
  ],
);
