import { createDb, type Database } from "./client.ts";
import { requireDatabaseUrl } from "./env.ts";

export * as schema from "./schema/index.ts";
export * from "./schema/index.ts";
export {
  createDb,
  type CreateDbOptions,
  type Database,
  type QueryLogger,
  type Schema,
} from "./client.ts";
export { byEvent } from "./scope.ts";
export {
  assertEventSlug,
  createEventRecord,
  eventInitials,
  EventInputError,
  isEventHostAvailable,
  isEventSlugAvailable,
  isUniqueViolation,
  normalizeEventHost,
  type EventInputField,
  type NewEventInput,
  type NewEventResult,
} from "./event-service.ts";
export {
  importLegacyContent,
  legacyFileName,
  LEGACY_FOTOS_DIR,
  LEGACY_SLUG,
  type LegacyImportOptions,
  type LegacyImportResult,
} from "./legacy/import.ts";
export { LEGACY_GALLERY, legacySections } from "./legacy/dani-gustavo.ts";
export { loadRootEnv, requireDatabaseUrl, ROOT_ENV_PATH } from "./env.ts";
export { newPublicId } from "./ids.ts";

let instance: Database | undefined;

/** Cliente compartilhado (pool criado na primeira chamada; conecta só na primeira query). */
export function getDb(): Database {
  instance ??= createDb(requireDatabaseUrl());
  return instance;
}

/** Atalho para `getDb()`; o pool é preguiçoso e só conecta na primeira query. */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb();
    const value: unknown = Reflect.get(real, prop, real);
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

// Operadores do drizzle reexportados para que os apps usem a mesma instância do pacote.
export {
  and,
  asc,
  count,
  desc,
  eq,
  getTableName,
  gt,
  inArray,
  isNotNull,
  isNull,
  isTable,
  like,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
// Fase 6: catálogo de planos e modelos de tarefas da plataforma (seed/setup e API).
export {
  DEFAULT_SIGNUP_PLAN_CODE,
  ensureOrgSubscription,
  ensurePlans,
  PLAN_CATALOG,
  type PlanSeed,
} from "./plan-catalog.ts";
export {
  ensurePlatformTaskTemplates,
  PLATFORM_TASK_TEMPLATES,
  type PlatformTemplateSeed,
} from "./platform-task-templates.ts";
