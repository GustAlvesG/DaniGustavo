import { eq, type SQL } from "drizzle-orm";
import type { MySqlColumn } from "drizzle-orm/mysql-core";

/**
 * Filtro de escopo: `byEvent(gifts, ev)` = `gifts.event_id = ev.id`. Use dentro do `and(...)`
 * de toda consulta em tabela com `event_id` (o auditor dos testes da API confere).
 */
export function byEvent(table: { eventId: MySqlColumn }, ev: { id: number }): SQL {
  return eq(table.eventId, ev.id);
}
