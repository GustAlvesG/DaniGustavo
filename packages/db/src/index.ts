import { createDb, type Database } from "./client.ts";
import { requireDatabaseUrl } from "./env.ts";

export * as schema from "./schema/index.ts";
export * from "./schema/index.ts";
export { createDb, type Database, type Schema } from "./client.ts";
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
