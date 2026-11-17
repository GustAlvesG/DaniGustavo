import { createDb, loadRootEnv } from "@casamento/db";
import { createApp, type AppDeps } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { parseEnv } from "../src/env.ts";

export const TEST_WEB_KEY = "chave-de-teste-com-mais-de-32-caracteres";

/** Ambiente válido de teste; DATABASE_URL vem do .env/CI (o pool só conecta na primeira query). */
export function testEnv(extra: Record<string, string> = {}) {
  loadRootEnv();
  return parseEnv({
    NODE_ENV: "test",
    DATABASE_URL: process.env.DATABASE_URL ?? "mysql://root:@127.0.0.1:3306/casamento",
    API_URL: "http://localhost:3333",
    WEB_KEY: TEST_WEB_KEY,
    BETTER_AUTH_SECRET: "segredo-de-teste-com-mais-de-32-caracteres",
    BETTER_AUTH_URL: "http://localhost:3333",
    ...extra,
  });
}

export function testApp(overrides: Partial<AppDeps> = {}, extraEnv: Record<string, string> = {}) {
  const env = testEnv(extraEnv);
  const db = createDb(env.DATABASE_URL);
  const app = createApp({ env, db, auth: createAuth(env, db), ...overrides });
  return { app, db, env };
}
