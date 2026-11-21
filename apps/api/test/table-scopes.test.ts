import { getTableName, isTable, schema } from "@casamento/db";
import { describe, expect, it } from "vitest";
import {
  ORG_SCOPED_TABLES,
  PLATFORM_TABLES,
  SCOPED_TABLES,
  STRUCTURAL_TABLES,
} from "./sql-audit.ts";

// Fase 6: toda tabela do schema tem escopo declarado no auditor (evento, organização,
// plataforma ou estrutura). Tabela nova sem classificação falha aqui, antes de escapar do
// auditor de SQL por não estar em lista nenhuma.

const tables = Object.values(schema)
  .filter((v) => isTable(v))
  .map((t) => getTableName(t));

describe("escopo das tabelas", () => {
  it("toda tabela está em exatamente uma lista", () => {
    const lists: readonly (readonly string[])[] = [
      SCOPED_TABLES,
      ORG_SCOPED_TABLES,
      PLATFORM_TABLES,
      STRUCTURAL_TABLES,
    ];
    for (const name of tables) {
      const hits = lists.filter((l) => l.includes(name)).length;
      expect(hits, name).toBe(1);
    }
  });

  it("as listas não citam tabela que não existe", () => {
    for (const name of [
      ...SCOPED_TABLES,
      ...ORG_SCOPED_TABLES,
      ...PLATFORM_TABLES,
      ...STRUCTURAL_TABLES,
    ]) {
      expect(tables, name).toContain(name);
    }
  });
});
