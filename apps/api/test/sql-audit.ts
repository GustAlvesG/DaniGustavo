import type { QueryLogger } from "@casamento/db";
import { currentQueryOrigin, trackQueryOrigins } from "@casamento/db/testing";
import { isCrossEvent } from "../src/tenancy/cross-event.ts";

// Auditor de escopo: SELECT/UPDATE/DELETE em tabela com event_id, sem `event_id` depois do FROM
// (WHERE/ON) e fora de crossEvent(), falha na hora. Tabelas por organização (Fase 3) seguem a
// mesma regra com `organization_id`. Só AUDIT_STRICT=0 (manual) volta ao modo
// que apenas registra e resume no fim da suíte.

export const SCOPED_TABLES = [
  "invitations",
  "guests",
  "rsvp_logs",
  "rsvp_reminders",
  "gifts",
  "gift_orders",
  "payments",
  "messages",
  "event_settings",
  "event_media",
] as const;

/** Fase 3: dados da organização; a consulta precisa filtrar por `organization_id`. */
export const ORG_SCOPED_TABLES = ["team_invites"] as const;

/** Tabela → coluna de escopo exigida depois do FROM. */
const SCOPE_COLUMN = new Map<string, string>([
  ...SCOPED_TABLES.map((t) => [t, "event_id"] as const),
  ...ORG_SCOPED_TABLES.map((t) => [t, "organization_id"] as const),
]);
export const AUDIT_STRICT = process.env.AUDIT_STRICT !== "0";

export interface SqlAnalysis {
  kind: "select" | "update" | "delete";
  tables: string[];
  scoped: boolean;
}

/** null = não é SELECT/UPDATE/DELETE em tabela com escopo. */
export function analyzeSql(sql: string): SqlAnalysis | null {
  const text = sql.trim();
  const kind = /^(select|update|delete)\b/i.exec(text)?.[1]?.toLowerCase() as
    SqlAnalysis["kind"] | undefined;
  if (!kind) return null;
  const tables = new Set<string>();
  for (const m of text.matchAll(/\b(?:from|join|update)\s+`(\w+)`/gi)) {
    if (SCOPE_COLUMN.has(m[1]!)) tables.add(m[1]!);
  }
  if (tables.size === 0) return null;
  // No SELECT, a lista de colunas costuma trazer `event_id`: só conta o que vem depois do FROM.
  // No UPDATE, o SET também pode citar a coluna: só conta depois do WHERE.
  const from = kind === "update" ? text.search(/\swhere\s/i) : text.search(/\sfrom\s/i);
  const rest = from === -1 ? "" : text.slice(from);
  const columns = new Set([...tables].map((t) => SCOPE_COLUMN.get(t)!));
  const scoped = [...columns].every((col) => new RegExp(`\`${col}\`\\s*(=|in\\b)`, "i").test(rest));
  return { kind, tables: [...tables], scoped };
}

/** Consulta sem valores e com espaços normalizados (chave do resumo). */
export function normalizeSql(sql: string): string {
  return sql
    .replace(/\s+/g, " ")
    .replace(/\((?:\?,\s*)+\?\)/g, "(?…)")
    .replace(/\b\d+\b/g, "N")
    .replace(/^select .*? from /i, "select … from ")
    .trim()
    .slice(0, 220);
}

/** Primeira linha da pilha dentro de apps/api/src (o módulo que montou a consulta). */
export function originOf(stack: string | undefined): string | null {
  if (!stack) return null;
  for (const line of stack.split("\n")) {
    const m = /(apps\/api\/src\/[^:)]+):(\d+)/.exec(line.replaceAll("\\", "/"));
    if (m && !m[1]!.includes("/tenancy/")) return `${m[1]!.replace(/^apps\/api\//, "")}:${m[2]}`;
  }
  return null;
}

const counts = new Map<string, number>();

export function auditCounts(): Record<string, number> {
  return Object.fromEntries(counts);
}

trackQueryOrigins();

/** Logger para `createDb(url, { logger })` nos testes. */
export const sqlAuditLogger: QueryLogger = {
  logQuery(sql) {
    const analysis = analyzeSql(sql);
    if (!analysis || analysis.scoped || isCrossEvent()) return;
    // Consultas montadas pelo próprio teste (preparação e limpeza) não contam.
    const origin = originOf(currentQueryOrigin());
    if (!origin) return;
    const key = `${origin} | ${normalizeSql(sql)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (AUDIT_STRICT) {
      throw new Error(
        `Consulta sem event_id em ${analysis.tables.join(", ")} (${origin}). ` +
          `Filtre com byEvent() ou envolva em crossEvent("motivo", fn).`,
      );
    }
  },
};
