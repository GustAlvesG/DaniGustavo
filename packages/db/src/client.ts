import type { Logger } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema/index.ts";

export type Schema = typeof schema;
export type Database = MySql2Database<Schema> & { $client: mysql.Pool };

/** Recebe cada SQL antes da execução (usado pelo auditor de escopo nos testes da API). */
export type QueryLogger = Logger;

export interface CreateDbOptions {
  logger?: QueryLogger;
}

export function createDb(url: string, options: CreateDbOptions = {}): Database {
  const pool = mysql.createPool({
    uri: url,
    charset: "utf8mb4_unicode_ci",
    timezone: "Z",
    supportBigNumbers: true,
    connectionLimit: 10,
  });
  return drizzle({ client: pool, schema, mode: "default", logger: options.logger }) as Database;
}
