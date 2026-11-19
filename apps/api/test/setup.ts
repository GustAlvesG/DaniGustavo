import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, inject } from "vitest";
import { auditCounts } from "./sql-audit.ts";

// Cada arquivo de teste grava o que o auditor de SQL viu; o global-setup soma e imprime no fim.
afterAll(() => {
  const dir = inject("sqlAuditDir");
  const counts = auditCounts();
  if (!dir || Object.keys(counts).length === 0) return;
  mkdirSync(dir, { recursive: true });
  const file = join(
    dir,
    `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  writeFileSync(file, JSON.stringify(counts));
});
