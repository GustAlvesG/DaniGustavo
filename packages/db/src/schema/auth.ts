import { boolean, index, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { createdAt, updatedAt, utcDatetime } from "./columns.ts";

// Tabelas do Better Auth (só o core: login por e-mail e senha, sem 2FA). As chaves das propriedades seguem os
// nomes de campo do Better Auth; as colunas no banco usam snake_case.
// varchar(191) em colunas indexadas: cabe no limite de índice do utf8mb4 em qualquer formato.

export const user = mysqlTable("user", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 191 }).notNull(),
  email: varchar("email", { length: 191 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** Papel na plataforma ("admin" vê todas as organizações); nulo para os demais. */
  platformRole: varchar("platform_role", { length: 32 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = mysqlTable(
  "session",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    expiresAt: utcDatetime("expires_at").notNull(),
    token: varchar("token", { length: 191 }).notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = mysqlTable(
  "account",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    accountId: varchar("account_id", { length: 191 }).notNull(),
    providerId: varchar("provider_id", { length: 64 }).notNull(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: utcDatetime("access_token_expires_at"),
    refreshTokenExpiresAt: utcDatetime("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = mysqlTable(
  "verification",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    identifier: varchar("identifier", { length: 191 }).notNull(),
    value: text("value").notNull(),
    expiresAt: utcDatetime("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
