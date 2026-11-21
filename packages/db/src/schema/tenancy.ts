import {
  boolean,
  index,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { user } from "./auth.ts";
import { createdAt, fk, pk, timestamps, utcDatetime } from "./columns.ts";

// Plataforma multi-evento: organização → eventos → domínios e membros. Tabelas próprias em vez
// do plugin organization do Better Auth (papel por evento, IDs bigint, sem rotas extras).

export const ORGANIZATION_STATUSES = ["active", "suspended"] as const;
export const EVENT_STATUSES = ["draft", "active", "archived"] as const;
/** Tipos de evento (vocabulário, módulos e tema padrão em `@casamento/shared` › event-types). */
export const EVENT_TYPES = [
  "wedding",
  "fifteen",
  "birthday",
  "baby_shower",
  "corporate",
  "other",
] as const;
export const ORGANIZATION_ROLES = ["owner", "member"] as const;
export const EVENT_ROLES = ["host"] as const;
export const PLATFORM_ROLES = ["admin"] as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];
export type EventStatus = (typeof EVENT_STATUSES)[number];
export type EventType = (typeof EVENT_TYPES)[number];
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];
export type EventRole = (typeof EVENT_ROLES)[number];
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/**
 * Evento criado pela migration 0006 a partir do site do casamento (Organização 1 → Evento 1).
 * TODO(fase1-etapa4): some quando os serviços receberem o evento do contexto (EventCtx).
 */
export const LEGACY_EVENT_ID = 1;

export const organizations = mysqlTable("organizations", {
  id: pk(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 191 }).notNull(),
  status: mysqlEnum("status", ORGANIZATION_STATUSES).notNull().default("active"),
  ...timestamps(),
});

export const events = mysqlTable(
  "events",
  {
    id: pk(),
    organizationId: fk("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    /** Único na plataforma: entra nas rotas públicas `/api/e/:slug`. */
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    /** Um de EVENT_TYPES (varchar para aceitar tipos novos sem migration). */
    type: varchar("type", { length: 32 }).notNull().default("wedding"),
    name: varchar("name", { length: 191 }).notNull(),
    status: mysqlEnum("status", EVENT_STATUSES).notNull().default("draft"),
    timezone: varchar("timezone", { length: 64 }).notNull().default("America/Sao_Paulo"),
    startsAt: utcDatetime("starts_at"),
    ...timestamps(),
  },
  (t) => [
    index("events_organization_id_idx").on(t.organizationId),
    // Fase 4: alvo da FK composta de event_vendors (fornecedor e evento da mesma organização).
    uniqueIndex("events_org_id_id_idx").on(t.organizationId, t.id),
  ],
);

export const eventDomains = mysqlTable(
  "event_domains",
  {
    id: pk(),
    eventId: fk("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** Como chega no header Host: minúsculo e com porta (ex.: `localhost:3000`). */
    host: varchar("host", { length: 191 }).notNull().unique(),
    /** O host primário substitui `SITE_URL` nos links do evento. */
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps(),
  },
  (t) => [index("event_domains_event_id_idx").on(t.eventId)],
);

export const organizationMembers = mysqlTable(
  "organization_members",
  {
    id: pk(),
    organizationId: fk("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ORGANIZATION_ROLES).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("organization_members_org_user_idx").on(t.organizationId, t.userId),
    index("organization_members_user_id_idx").on(t.userId),
  ],
);

export const eventMembers = mysqlTable(
  "event_members",
  {
    id: pk(),
    eventId: fk("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", EVENT_ROLES).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("event_members_event_user_idx").on(t.eventId, t.userId),
    index("event_members_user_id_idx").on(t.userId),
  ],
);

/**
 * Fase 3: papel oferecido por um convite da equipe. `owner`/`member` = equipe da organização
 * (`event_id` nulo); `host` = anfitrião de um evento da organização (`event_id` preenchido).
 */
export const TEAM_INVITE_ROLES = ["owner", "member", "host"] as const;
export type TeamInviteRole = (typeof TEAM_INVITE_ROLES)[number];

/**
 * Convites por e-mail para a equipe da organização ou para anfitrião de um evento (Fase 3). O
 * token vai só no e-mail; aqui fica o SHA-256 dele (hex). Aceite: cria a conta (com senha) ou
 * vincula a conta existente do mesmo e-mail; o cadastro público do Better Auth segue desligado.
 * Dados por organização: o auditor de SQL dos testes exige `organization_id` no WHERE.
 * Que o evento pertence à organização é conferido na aplicação (sem FK composta).
 */
export const teamInvites = mysqlTable(
  "team_invites",
  {
    id: pk(),
    organizationId: fk("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Nulo = convite para a equipe da organização; preenchido = anfitrião deste evento. */
    eventId: fk("event_id").references(() => events.id, { onDelete: "cascade" }),
    /** Minúsculo, sem espaços. */
    email: varchar("email", { length: 191 }).notNull(),
    role: mysqlEnum("role", TEAM_INVITE_ROLES).notNull(),
    /** SHA-256 (hex) do token enviado no e-mail; o token em si não é gravado. */
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    invitedBy: varchar("invited_by", { length: 36 }).references(() => user.id, {
      onDelete: "set null",
    }),
    expiresAt: utcDatetime("expires_at").notNull(),
    acceptedAt: utcDatetime("accepted_at"),
    acceptedBy: varchar("accepted_by", { length: 36 }).references(() => user.id, {
      onDelete: "set null",
    }),
    revokedAt: utcDatetime("revoked_at"),
    ...timestamps(),
  },
  (t) => [
    index("team_invites_org_email_idx").on(t.organizationId, t.email),
    index("team_invites_event_id_idx").on(t.eventId),
  ],
);
