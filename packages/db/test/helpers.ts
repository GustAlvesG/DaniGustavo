import mysql from "mysql2/promise";
import { createDb, type Database } from "../src/client.ts";
import { requireDatabaseUrl } from "../src/env.ts";

/**
 * Cria (se preciso) um banco `<nome>_test` ao lado do DATABASE_URL e devolve um cliente
 * para ele. Assim os testes podem apagar tudo sem tocar no banco de desenvolvimento.
 */
export async function createTestDb(): Promise<Database> {
  const url = new URL(requireDatabaseUrl());
  const name = `${url.pathname.replace(/^\//, "") || "casamento"}_test`;
  const admin = await mysql.createConnection({ uri: url.toString().replace(url.pathname, "/") });
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await admin.end();
  url.pathname = `/${name}`;
  return createDb(url.toString());
}
