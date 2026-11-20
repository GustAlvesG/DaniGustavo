import { and, byEvent, eq, eventSettings, type Database } from "@casamento/db";
import {
  modulesFor,
  type EventModules,
  type EventModulesInput,
  vocabularyFor,
  VocabularyOverrides,
  type ModuleId,
  type Vocabulary,
} from "@casamento/shared";
import type { MiddlewareHandler } from "hono";
import { routeNotFound } from "../errors.ts";
import type { EventCtx, PublicEventEnv } from "./types.ts";

/** Módulos do evento: padrão do tipo + `event_settings` › `event.modules`. */
export async function eventModules(ev: EventCtx, db: Database): Promise<EventModules> {
  const [row] = await db
    .select({ value: eventSettings.value })
    .from(eventSettings)
    .where(and(byEvent(eventSettings, ev), eq(eventSettings.key, "event.modules")));
  return modulesFor(ev.type, (row?.value ?? null) as EventModulesInput | null);
}

/**
 * Rotas públicas de um módulo: desligado → o mesmo 404 de rota inexistente. Depois de
 * `publicEvent`. Pedidos já criados (status, webhook) não passam por aqui: o pagamento em
 * andamento termina mesmo se o anfitrião desligar a lista.
 */
export function requireModule(db: Database, module: ModuleId): MiddlewareHandler<PublicEventEnv> {
  return async (c, next) => {
    const modules = await eventModules(c.get("event"), db);
    if (!modules[module]) return routeNotFound(c);
    await next();
  };
}

/** Vocabulário do evento (dicionário do tipo + palavras trocadas no painel). */
export async function eventVocabulary(ev: EventCtx, db: Database): Promise<Vocabulary> {
  const [row] = await db
    .select({ value: eventSettings.value })
    .from(eventSettings)
    .where(and(byEvent(eventSettings, ev), eq(eventSettings.key, "event.vocabulary")));
  const parsed = VocabularyOverrides.safeParse(row?.value ?? {});
  return vocabularyFor(ev.type, parsed.success ? parsed.data : {});
}

/** "O casamento" → "no casamento", "A festa" → "na festa" (preposição contraída com o artigo). */
export function inEvent(eventLabel: string): string {
  const m = /^(o|a)\s+(.+)$/i.exec(eventLabel.trim());
  if (!m) return `em ${eventLabel.trim().toLowerCase()}`;
  return `${m[1]!.toLowerCase() === "o" ? "no" : "na"} ${m[2]!.toLowerCase()}`;
}

/** "O casamento" → "o casamento" (para "para o casamento"). */
export const eventPhrase = (eventLabel: string) => eventLabel.trim().toLowerCase();
