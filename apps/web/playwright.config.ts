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

const port = 3100;

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
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `pnpm exec next dev --turbopack -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
