import { bigint, index, int, mysqlEnum, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { user } from "./auth.ts";
import { fk, pk, timestamps, utcDatetime } from "./columns.ts";
import { events, organizations } from "./tenancy.ts";

/*
 * Fase 6 (docs/saas/fase-6.md, frente C): LGPD. Pedidos dos titulares (convidados) por evento e
 * o registro mínimo do que foi apagado quando um evento é excluído. Migration 0012.
 */

export const PRIVACY_REQUEST_KINDS = ["access", "correction", "erasure", "other"] as const;
export const PRIVACY_REQUEST_STATUSES = ["open", "done", "rejected"] as const;
export type PrivacyRequestKind = (typeof PRIVACY_REQUEST_KINDS)[number];
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

/**
 * Pedido de um titular (convidado, comprador, autor de recado) feito pelo site do evento: acesso,
 * correção ou exclusão dos dados. Quem atende é a equipe do evento (controladora); a plataforma
 * é operadora. Dados do evento: o auditor exige `event_id`.
 */
export const privacyRequests = mysqlTable(
  "privacy_requests",
  {
    id: pk(),
    eventId: fk("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", PRIVACY_REQUEST_KINDS).notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    email: varchar("email", { length: 191 }).notNull(),
    message: text("message"),
    status: mysqlEnum("status", PRIVACY_REQUEST_STATUSES).notNull().default("open"),
    /** Resposta registrada pela equipe (o e-mail ao titular sai com ela). */
    response: text("response"),
    resolvedBy: varchar("resolved_by", { length: 36 }).references(() => user.id, {
      onDelete: "set null",
    }),
    resolvedAt: utcDatetime("resolved_at"),
    /** SHA-256 do IP de quem pediu (rate limit/abuso sem guardar o IP em claro). */
    ipHash: varchar("ip_hash", { length: 64 }),
    ...timestamps(),
  },
  (t) => [index("privacy_requests_event_status_idx").on(t.eventId, t.status)],
);

/**
 * Evento apagado (Fase 6): o que sobra depois de `DELETE` é só este resumo sem dado pessoal,
 * para a organização e a plataforma saberem o que existiu (e a taxa já recebida). Sem FK para
 * `events` (a linha do evento não existe mais). Dados da organização: auditor por
 * `organization_id`.
 */
export const eventDeletions = mysqlTable(
  "event_deletions",
  {
    id: pk(),
    organizationId: fk("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Id que o evento tinha (só referência; não é FK). */
    formerEventId: bigint("former_event_id", { mode: "number", unsigned: true }).notNull(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    ordersCount: int("orders_count").notNull().default(0),
    paidTotalCents: bigint("paid_total_cents", { mode: "number" }).notNull().default(0),
    platformFeeCents: bigint("platform_fee_cents", { mode: "number" }).notNull().default(0),
    deletedBy: varchar("deleted_by", { length: 36 }).references(() => user.id, {
      onDelete: "set null",
    }),
    deletedAt: utcDatetime("deleted_at").notNull(),
    ...timestamps(),
  },
  (t) => [index("event_deletions_org_idx").on(t.organizationId)],
);
