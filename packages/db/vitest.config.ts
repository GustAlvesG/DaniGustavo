import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Os testes de integração compartilham o mesmo banco.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
