import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Auditor de escopo por evento (test/sql-audit.ts): registra e resume consultas sem event_id.
    setupFiles: ["test/setup.ts"],
    globalSetup: ["test/global-setup.ts"],
  },
});
