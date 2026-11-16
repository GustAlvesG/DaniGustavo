import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

/** Saída do `vite build` do painel (ver vite.config.ts). */
export const PAINEL_DIST = fileURLToPath(new URL("../dist/painel", import.meta.url));

/** Serve o SPA do painel em /painel, com fallback para index.html nas rotas do cliente. */
export function painelRoutes(distDir: string = PAINEL_DIST) {
  const app = new Hono();

  app.get("/painel", (c) => c.redirect("/painel/", 301));

  app.use(
    "/painel/assets/*",
    serveStatic({
      root: distDir,
      rewriteRequestPath: (p) => p.replace(/^\/painel/, ""),
      onFound: (_p, c) => {
        c.header("Cache-Control", "public, max-age=31536000, immutable");
      },
    }),
  );
  app.use(
    "/painel/*",
    serveStatic({ root: distDir, rewriteRequestPath: (p) => p.replace(/^\/painel/, "") }),
  );

  app.get("/painel/*", async (c) => {
    const index = `${distDir}/index.html`;
    if (!existsSync(index)) {
      return c.text(
        "O painel ainda não foi compilado. Rode `pnpm --filter @casamento/api build` " +
          "(ou aguarde o `dev` terminar a primeira compilação) e recarregue a página.",
        503,
      );
    }
    c.header("Cache-Control", "no-store");
    return c.html(await readFile(index, "utf8"));
  });

  return app;
}
