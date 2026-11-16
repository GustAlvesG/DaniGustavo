import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/mysql2/migrator";
import type { Database } from "./client.ts";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url));

/** Aplica as migrations geradas pelo drizzle-kit (mesma tabela de controle do `drizzle-kit migrate`). */
export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
