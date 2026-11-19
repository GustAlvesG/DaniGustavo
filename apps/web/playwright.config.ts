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
  // Domínios desta porta e o evento 2 de teste (idempotente; veja e2e/support/multi-setup.ts).
  globalSetup: "./e2e/support/multi-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "on-first-retry" },
  projects: [
    {
      name: "mobile",
      testIgnore: /prazo.spec.ts|painel(-.+)?.spec.ts|multi-evento.spec.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "desktop",
      testIgnore: /prazo.spec.ts|painel(-.+)?.spec.ts|multi-evento.spec.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // Painel dos noivos (na API, /painel), no tamanho do celular: mexe em dados próprios.
      name: "painel",
      testMatch: /painel(-.+)?.spec.ts/,
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
    {
      // Dois eventos lado a lado (evento1/evento2.localhost:<porta>) e host desconhecido.
      name: "multi",
      testMatch: /multi-evento.spec.ts/,
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
      // Nunca o Asaas do .env de dev (chave de produção) nos e2e.
      env: { PAYMENT_PROVIDER: "simulado" },
      url: "http://localhost:3333/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm exec next dev --turbopack -p ${port}`,
      // O site responde por Host (e o setup global cria os domínios depois que os servidores
      // sobem): a prontidão olha um estático fora do proxy.
      url: `http://localhost:${port}/sw.js`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
