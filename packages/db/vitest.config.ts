import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Os testes de integração compartilham o mesmo banco.
    fileParallelism: false,
    testTimeout: 30_000,
    // beforeAll recria o banco de teste (reset + 6 migrations + seed). As migrations em MariaDB
    // são DDL com fsync: ~5 s sozinhas e mais que 10 s (o padrão) quando a suíte da API
    // martela o mesmo servidor em paralelo. Não há disputa de lock nem banco compartilhado
    // (aqui é `<db>_test`, a API usa o `<db>` de desenvolvimento): é só lentidão de I/O.
    hookTimeout: 90_000,
  },
});
