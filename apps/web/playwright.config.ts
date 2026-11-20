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
// API dos e2e: 3333 por padrão (a do .env). Com E2E_API_PORT, sobe outra API nessa porta e o
// site e os testes passam a apontar para ela (API_URL), sem tocar nos servidores abertos.
const apiPort = Number(process.env.E2E_API_PORT ?? 3333);
if (process.env.E2E_API_PORT) process.env.API_URL = `http://localhost:${apiPort}`;

export default defineConfig({
  testDir: "./e2e",
  // Domínios desta porta e o evento 2 de teste (idempotente; veja e2e/support/multi-setup.ts).
  globalSetup: "./e2e/support/multi-setup.ts",
  fullyParallel: true,
  // Local, o `next dev` (Turbopack, Windows) compilando as rotas para 6 workers ao mesmo tempo às
  // vezes grava um JSON pela metade e a página falha a rodada toda (SyntaxError no JSON.parse).
  // Com 2 workers a suíte passa estável; no CI vale o padrão do Playwright.
  workers: process.env.CI ? undefined : 2,
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
      // API (Hono) para os e2e de RSVP e de conteúdo; precisa do MariaDB no ar. O painel é
      // montado antes (vite build), para os e2e nunca testarem um painel/dist antigo.
      command: "pnpm --filter @casamento/api build && pnpm --filter @casamento/api dev:server",
      // Nunca o Asaas do .env de dev (chave de produção) nos e2e. A revalidação do cache
      // (POST /api/revalidar) vai para o site deste e2e, não para o da porta 3000.
      env: {
        PAYMENT_PROVIDER: "simulado",
        PORT: String(apiPort),
        WEB_INTERNAL_URL: `http://localhost:${port}`,
        // Em outra porta, o login do painel precisa da origem certa no Better Auth.
        ...(process.env.E2E_API_PORT
          ? {
              API_URL: `http://localhost:${apiPort}`,
              BETTER_AUTH_URL: `http://localhost:${apiPort}`,
            }
          : {}),
      },
      url: `http://localhost:${apiPort}/api/health`,
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
