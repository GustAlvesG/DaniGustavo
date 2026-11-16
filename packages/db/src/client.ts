import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema/index.ts";

export type Schema = typeof schema;
export type Database = MySql2Database<Schema> & { $client: mysql.Pool };

export function createDb(url: string): Database {
  const pool = mysql.createPool({
    uri: url,
    charset: "utf8mb4_unicode_ci",
    timezone: "Z",
    supportBigNumbers: true,
    connectionLimit: 10,
  });
  return drizzle({ client: pool, schema, mode: "default" }) as Database;
}
