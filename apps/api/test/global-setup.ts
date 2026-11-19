import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, loadRootEnv } from "@casamento/db";
import { runMigrations } from "@casamento/db/migrate";
import { resetDatabase } from "@casamento/db/reset";
import { seed } from "@casamento/db/seed";
import { ensureDatabase } from "@casamento/db/testing";
import type { TestProject } from "vitest/node";
import { apiTestDatabaseUrl, TEST_SEED_ENV } from "./test-database.ts";

declare module "vitest" {
  export interface ProvidedContext {
    sqlAuditDir: string;
  }
}

/** Resumo do auditor de SQL: consulta normalizada → quantas vezes rodou sem event_id. */
export default async function setup(project: TestProject) {
  // Banco próprio da suíte (nunca o de desenvolvimento): recriado do zero a cada execução,
  // com as migrations e o seed mínimo (organização 1, evento 1, configurações e presentes).
  loadRootEnv();
  const url = apiTestDatabaseUrl();
  await ensureDatabase(url);
  const db = createDb(url);
  try {
    await resetDatabase(db);
    await runMigrations(db);
    await seed(db, TEST_SEED_ENV);
  } finally {
    await db.$client.end();
  }

  const dir = mkdtempSync(join(tmpdir(), "casamento-sql-audit-"));
  project.provide("sqlAuditDir", dir);
  return () => {
    const total = new Map<string, number>();
    for (const name of readdirSync(dir)) {
      const counts = JSON.parse(readFileSync(join(dir, name), "utf8")) as Record<string, number>;
      for (const [key, n] of Object.entries(counts)) total.set(key, (total.get(key) ?? 0) + n);
    }
    rmSync(dir, { recursive: true, force: true });
    if (total.size === 0) return;
    const rows = [...total].sort((a, b) => b[1] - a[1]);
    const sum = rows.reduce((s, [, n]) => s + n, 0);
    const modules = new Map<string, number>();
    for (const [key, n] of rows) {
      const mod = key.split(":")[0]!;
      modules.set(mod, (modules.get(mod) ?? 0) + n);
    }
    const lines = [
      "",
      `[auditor de SQL] ${rows.length} consultas distintas sem event_id (${sum} execuções).` +
        " Os testes já falham ao ver uma (AUDIT_STRICT=0 desliga).",
      "Por módulo:",
      ...[...modules]
        .sort((a, b) => b[1] - a[1])
        .map(([m, n]) => `  ${String(n).padStart(5)}  ${m}`),
      "Consultas:",
      ...rows.map(([key, n]) => `  ${String(n).padStart(5)}  ${key}`),
      "",
    ];
    console.log(lines.join("\n"));
  };
}
