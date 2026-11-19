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
    // JSON sempre como texto: o MySQL 8 e o MariaDB ≥ 10.5 marcam a coluna como JSON e o
    // driver já devolveria objeto (e um valor JSON que é só uma string, como "2027-04-10…",
    // viria sem aspas e quebraria o JSON.parse da coluna). Ver schema/columns.ts.
    jsonStrings: true,
    connectionLimit: 10,
  });
  return drizzle({ client: pool, schema, mode: "default" }) as Database;
}
