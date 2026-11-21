import {
  date,
  foreignKey,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { user } from "./auth.ts";
import { fk, pk, timestamps, utcDatetime } from "./columns.ts";
import { events, organizations } from "./tenancy.ts";

/*
 * Fase 4 (docs/saas/fase-4.md): gestão do evento — tarefas e modelos, fornecedores e contratos,
 * orçamentos e parcelas, planejado × realizado e cronograma do dia. Migration 0010.
 *
 * Dados da organização (`vendors`, `task_templates`, `task_template_items`) levam
 * `organization_id`; dados do evento levam `event_id` (o auditor de SQL dos testes exige a
 * coluna no WHERE/ON). Dinheiro em centavos (int). Datas de calendário (prazo, vencimento,
 * validade) em DATE "AAAA-MM-DD" no fuso do evento; instantes em DATETIME(3) UTC.
 * Categorias e status em varchar/enum com as listas em `@casamento/shared` › planning.
 */

export const TASK_STATUSES = ["todo", "doing", "done"] as const;
export const EVENT_VENDOR_STATUSES = ["prospect", "hired", "dismissed"] as const;
export const QUOTE_STATUSES = ["draft", "received", "approved", "contracted", "declined"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type EventVendorStatus = (typeof EVENT_VENDOR_STATUSES)[number];
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

const eventId = () =>
  fk("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" });

const organizationId = () =>
  fk("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });

/* ------------------------------------------------------------------------ */
/* Organização                                                               */
/* ------------------------------------------------------------------------ */

/** Catálogo de fornecedores da organização (reaproveitado entre eventos). */
export const vendors = mysqlTable(
  "vendors",
  {
    id: pk(),
    organizationId: organizationId(),
    name: varchar("name", { length: 191 }).notNull(),
    /** Uma de VENDOR_CATEGORIES (varchar para aceitar categoria nova sem migration). */
    category: varchar("category", { length: 32 }).notNull(),
    contactName: varchar("contact_name", { length: 191 }),
    email: varchar("email", { length: 191 }),
    phone: varchar("phone", { length: 32 }),
    website: varchar("website", { length: 300 }),
    /** CPF ou CNPJ, só dígitos. */
    document: varchar("document", { length: 14 }),
    notes: text("notes"),
    /** Avaliação da organização, 1 a 5; nula = sem avaliação. */
    rating: int("rating"),
    /** Arquivado some das listas de escolha; não se apaga fornecedor usado em evento. */
    archivedAt: utcDatetime("archived_at"),
    ...timestamps(),
  },
  (t) => [
    // (organization_id, id) único: alvo da FK composta de event_vendors.
    uniqueIndex("vendors_org_id_id_idx").on(t.organizationId, t.id),
    index("vendors_org_category_idx").on(t.organizationId, t.category),
  ],
);

/** Modelo de tarefas da organização (ex.: "Casamento completo"), por tipo de evento. */
export const taskTemplates = mysqlTable(
  "task_templates",
  {
    id: pk(),
    organizationId: organizationId(),
    name: varchar("name", { length: 191 }).notNull(),
    /** Um de EVENT_TYPES; nulo = serve para qualquer tipo. */
    eventType: varchar("event_type", { length: 32 }),
    description: text("description"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("task_templates_org_id_id_idx").on(t.organizationId, t.id)],
);

export const taskTemplateItems = mysqlTable(
  "task_template_items",
  {
    id: pk(),
    organizationId: organizationId(),
    templateId: fk("template_id").notNull(),
    title: varchar("title", { length: 191 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 32 }).notNull(),
    /** Dias em relação à data do evento: -90 = 90 dias antes; 0 = no dia; 1 = no dia seguinte. */
    offsetDays: int("offset_days").notNull(),
    sort: int("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index("task_template_items_org_template_idx").on(t.organizationId, t.templateId, t.sort),
    foreignKey({
      name: "task_template_items_template_fk",
      columns: [t.organizationId, t.templateId],
      foreignColumns: [taskTemplates.organizationId, taskTemplates.id],
    }).onDelete("cascade"),
  ],
);

/* ------------------------------------------------------------------------ */
/* Evento                                                                    */
/* ------------------------------------------------------------------------ */

/** Checklist do evento. */
export const eventTasks = mysqlTable(
  "event_tasks",
  {
    id: pk(),
    eventId: eventId(),
    title: varchar("title", { length: 191 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 32 }).notNull(),
    status: mysqlEnum("status", TASK_STATUSES).notNull().default("todo"),
    /** Membro da organização ou anfitrião do evento (conferido na aplicação). */
    assigneeUserId: varchar("assignee_user_id", { length: 36 }).references(() => user.id, {
      onDelete: "set null",
    }),
    /** Prazo (data local do evento); nulo = sem prazo. */
    dueOn: date("due_on", { mode: "string" }),
    /**
     * Prazo relativo à data do evento (-90 = 90 dias antes). Preenchido: `due_on` é calculado
     * a partir dele e recalculado quando a data do evento muda. Nulo = prazo absoluto.
     */
    dueOffsetDays: int("due_offset_days"),
    /** Item de modelo que gerou a tarefa (só procedência; sem FK). */
    templateItemId: fk("template_item_id"),
    completedAt: utcDatetime("completed_at"),
    completedBy: varchar("completed_by", { length: 36 }).references(() => user.id, {
      onDelete: "set null",
    }),
    sort: int("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("event_tasks_event_id_id_idx").on(t.eventId, t.id),
    index("event_tasks_event_status_due_idx").on(t.eventId, t.status, t.dueOn),
  ],
);

/**
 * Fornecedor do catálogo ligado a um evento. `organization_id` repetido para as FKs compostas
 * garantirem no banco que fornecedor e evento são da mesma organização.
 */
export const eventVendors = mysqlTable(
  "event_vendors",
  {
    id: pk(),
    eventId: fk("event_id").notNull(),
    organizationId: fk("organization_id").notNull(),
    vendorId: fk("vendor_id").notNull(),
    /** Categoria neste evento (padrão: a do catálogo); chave do planejado × realizado. */
    category: varchar("category", { length: 32 }).notNull(),
    status: mysqlEnum("status", EVENT_VENDOR_STATUSES).notNull().default("prospect"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("event_vendors_event_id_id_idx").on(t.eventId, t.id),
    uniqueIndex("event_vendors_event_vendor_idx").on(t.eventId, t.vendorId),
    index("event_vendors_org_vendor_idx").on(t.organizationId, t.vendorId),
    foreignKey({
      name: "event_vendors_event_fk",
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete("cascade"),
    // Fornecedor usado em evento não se apaga (arquiva-se).
    foreignKey({
      name: "event_vendors_vendor_fk",
      columns: [t.organizationId, t.vendorId],
      foreignColumns: [vendors.organizationId, vendors.id],
    }).onDelete("restrict"),
  ],
);

/**
 * Contrato (PDF/imagem) do fornecedor no evento. Arquivo na área privada do Storage
 * (`<eventId>/private/<file>`), servido só pelo painel com sessão; nunca em /uploads.
 */
export const vendorContracts = mysqlTable(
  "vendor_contracts",
  {
    id: pk(),
    eventId: fk("event_id").notNull(),
    eventVendorId: fk("event_vendor_id").notNull(),
    title: varchar("title", { length: 191 }).notNull(),
    /** Nome no Storage privado (ULID + extensão). */
    file: varchar("file", { length: 191 }).notNull(),
    /** Nome original do arquivo enviado (para o download). */
    originalName: varchar("original_name", { length: 191 }).notNull(),
    mime: varchar("mime", { length: 64 }).notNull(),
    bytes: int("bytes", { unsigned: true }).notNull(),
    signedOn: date("signed_on", { mode: "string" }),
    notes: text("notes"),
    uploadedBy: varchar("uploaded_by", { length: 36 }).references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => [
    index("vendor_contracts_event_vendor_idx").on(t.eventId, t.eventVendorId),
    uniqueIndex("vendor_contracts_event_file_idx").on(t.eventId, t.file),
    foreignKey({
      name: "vendor_contracts_event_vendor_fk",
      columns: [t.eventId, t.eventVendorId],
      foreignColumns: [eventVendors.eventId, eventVendors.id],
    }).onDelete("cascade"),
  ],
);

/** Orçamento de um fornecedor do evento. */
export const quotes = mysqlTable(
  "quotes",
  {
    id: pk(),
    eventId: fk("event_id").notNull(),
    eventVendorId: fk("event_vendor_id").notNull(),
    title: varchar("title", { length: 191 }).notNull(),
    /** Categoria do planejado × realizado (padrão: a do fornecedor no evento). */
    category: varchar("category", { length: 32 }).notNull(),
    status: mysqlEnum("status", QUOTE_STATUSES).notNull().default("draft"),
    /** Desconto sobre a soma dos itens. */
    discountCents: int("discount_cents").notNull().default(0),
    /** Soma dos itens menos o desconto; mantido pela aplicação a cada gravação. */
    totalCents: int("total_cents").notNull().default(0),
    validUntil: date("valid_until", { mode: "string" }),
    receivedAt: utcDatetime("received_at"),
    approvedAt: utcDatetime("approved_at"),
    contractedAt: utcDatetime("contracted_at"),
    declinedAt: utcDatetime("declined_at"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("quotes_event_id_id_idx").on(t.eventId, t.id),
    index("quotes_event_vendor_idx").on(t.eventId, t.eventVendorId),
    index("quotes_event_status_idx").on(t.eventId, t.status),
    foreignKey({
      name: "quotes_event_vendor_fk",
      columns: [t.eventId, t.eventVendorId],
      foreignColumns: [eventVendors.eventId, eventVendors.id],
    }).onDelete("cascade"),
  ],
);

export const quoteItems = mysqlTable(
  "quote_items",
  {
    id: pk(),
    eventId: fk("event_id").notNull(),
    quoteId: fk("quote_id").notNull(),
    description: varchar("description", { length: 300 }).notNull(),
    quantity: int("quantity").notNull().default(1),
    unitCents: int("unit_cents").notNull(),
    sort: int("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index("quote_items_event_quote_idx").on(t.eventId, t.quoteId, t.sort),
    foreignKey({
      name: "quote_items_quote_fk",
      columns: [t.eventId, t.quoteId],
      foreignColumns: [quotes.eventId, quotes.id],
    }).onDelete("cascade"),
  ],
);

/** Parcelas de pagamento ao fornecedor, geradas ao contratar o orçamento. */
export const quoteInstallments = mysqlTable(
  "quote_installments",
  {
    id: pk(),
    eventId: fk("event_id").notNull(),
    quoteId: fk("quote_id").notNull(),
    /** 1, 2, 3… na ordem de vencimento. */
    number: int("number").notNull(),
    dueOn: date("due_on", { mode: "string" }).notNull(),
    amountCents: int("amount_cents").notNull(),
    paidAt: utcDatetime("paid_at"),
    /** Forma de pagamento livre (Pix, boleto, transferência…). */
    method: varchar("method", { length: 32 }),
    notes: varchar("notes", { length: 300 }),
    ...timestamps(),
  },
  (t) => [
    index("quote_installments_event_due_idx").on(t.eventId, t.dueOn),
    uniqueIndex("quote_installments_event_quote_number_idx").on(t.eventId, t.quoteId, t.number),
    foreignKey({
      name: "quote_installments_quote_fk",
      columns: [t.eventId, t.quoteId],
      foreignColumns: [quotes.eventId, quotes.id],
    }).onDelete("cascade"),
  ],
);

/** Orçamento previsto do evento por categoria (o "planejado" do planejado × realizado). */
export const budgetLines = mysqlTable(
  "budget_lines",
  {
    id: pk(),
    eventId: eventId(),
    category: varchar("category", { length: 32 }).notNull(),
    plannedCents: int("planned_cents").notNull(),
    notes: varchar("notes", { length: 300 }),
    ...timestamps(),
  },
  (t) => [uniqueIndex("budget_lines_event_category_idx").on(t.eventId, t.category)],
);

/** Cronograma (roteiro) do dia do evento. */
export const scheduleItems = mysqlTable(
  "schedule_items",
  {
    id: pk(),
    eventId: eventId(),
    startsAt: utcDatetime("starts_at").notNull(),
    endsAt: utcDatetime("ends_at"),
    title: varchar("title", { length: 191 }).notNull(),
    details: text("details"),
    location: varchar("location", { length: 191 }),
    /** Responsável em texto livre (pessoa da equipe, padrinho…). */
    responsible: varchar("responsible", { length: 191 }),
    /**
     * Fornecedor do evento responsável (sem FK: FK composta com SET NULL anularia event_id).
     * A aplicação confere que é do evento e anula ao desligar o fornecedor.
     */
    eventVendorId: fk("event_vendor_id"),
    sort: int("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("schedule_items_event_starts_idx").on(t.eventId, t.startsAt, t.sort)],
);
