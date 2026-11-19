import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    sqlAuditDir: string;
  }
}

/** Resumo do auditor de SQL: consulta normalizada → quantas vezes rodou sem event_id. */
export default function setup(project: TestProject) {
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
        " Só aviso até a etapa 8 (AUDIT_STRICT=1 faz falhar).",
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
