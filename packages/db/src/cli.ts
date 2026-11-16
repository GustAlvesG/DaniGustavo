import { createDb } from "./client.ts";
import { requireDatabaseUrl } from "./env.ts";
import { runMigrations } from "./migrate.ts";
import { resetDatabase } from "./reset.ts";
import { seed } from "./seed.ts";

// Uso: node src/cli.ts <migrate|seed|reset>

const command = process.argv[2];
const db = createDb(requireDatabaseUrl());

try {
  if (command === "migrate") {
    await runMigrations(db);
    console.log("Migrations aplicadas.");
  } else if (command === "seed") {
    console.log("Seed concluído:", await seed(db));
  } else if (command === "reset") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("db:reset apaga todos os dados e só pode rodar fora de produção.");
    }
    await resetDatabase(db);
    console.log("Tabelas apagadas.");
    await runMigrations(db);
    console.log("Migrations aplicadas.");
    console.log("Seed concluído:", await seed(db));
  } else {
    throw new Error(`Comando desconhecido: "${command ?? ""}". Use migrate, seed ou reset.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
