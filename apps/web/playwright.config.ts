import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { defineConfig, devices } from "@playwright/test";

// Mesmo .env da raiz que o next.config.ts lê (API_URL para os testes de conteúdo).
const rootEnv = join(__dirname, "..", "..", ".env");
if (existsSync(rootEnv)) {
  for (const [k, v] of Object.entries(parseEnv(readFileSync(rootEnv, "utf8")))) {
    if (process.env[k] === undefined && v !== undefined) process.env[k] = v;
  }
}

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "on-first-retry" },
  projects: [
    {
      name: "mobile",
      testIgnore: /prazo.spec.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "desktop",
      testIgnore: /prazo.spec.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // O prazo do RSVP é uma configuração global: este teste a altera e restaura,
      // então roda sozinho, depois dos outros projetos.
      name: "prazo",
      testMatch: /prazo.spec.ts/,
      dependencies: ["mobile", "desktop"],
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      // API (Hono) para os e2e de RSVP e de conteúdo; precisa do MariaDB no ar.
      command: "pnpm --filter @casamento/api dev:server",
      url: "http://localhost:3333/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm exec next dev --turbopack -p ${port}`,
      url: `http://localhost:${port}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
