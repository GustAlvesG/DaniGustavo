import { loadRootEnv } from "@casamento/db";
import { testDatabaseUrl } from "@casamento/db/testing";

const FALLBACK = "mysql://root:@127.0.0.1:3306/casamento";

/** Banco dedicado dos testes da API: `<DATABASE_URL>_api_test` (ou TEST_DATABASE_URL). */
export function apiTestDatabaseUrl(): string {
  loadRootEnv();
  return testDatabaseUrl(process.env.DATABASE_URL ?? FALLBACK, "api_test");
}

/** Administradores criados pelo seed do banco de testes (fictícios). */
export const TEST_SEED_ENV = {
  ADMIN_EMAIL_1: "seed-admin-1@teste.local",
  ADMIN_EMAIL_2: "seed-admin-2@teste.local",
  ADMIN_PASSWORD_INICIAL: "senha-seed-teste-123",
};
