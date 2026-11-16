import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// .env único na raiz do monorepo; variáveis já definidas (CI) têm prioridade.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  dialect: "mysql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
