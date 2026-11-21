import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

/** Saída do `vite build` do painel (ver vite.config.ts). */
export const PAINEL_DIST = fileURLToPath(new URL("../dist/painel", import.meta.url));

/**
 * CSP do painel (Fase 6): o build do Vite não tem script nem estilo inline em <script>/<style>,
 * então script só da própria origem. `style-src 'unsafe-inline'` cobre os `style={}` do React;
 * imagens: fotos em /uploads, miniaturas em blob: e QR em data:.
 */
export const PAINEL_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Fase 7: portaria (`/portaria/`) — o mesmo build do painel, com `media-src` para o vídeo da
 * câmera (o leitor de QR usa `getUserMedia` + `BarcodeDetector`, sem dependência).
 */
export const PORTARIA_CSP = `${PAINEL_CSP}; media-src 'self' blob: mediastream:`;

/** Fase 7: só a portaria libera a câmera (para a própria origem); o resto da API nega tudo. */
export const PORTARIA_PERMISSIONS_POLICY =
  "camera=(self), microphone=(), geolocation=(), payment=(), usb=()";

/**
 * Páginas sem conta servidas pelo mesmo build do painel (Fase 7): o `App.tsx` olha o
 * `location.pathname` e abre a portaria (frente A) ou o portal do fornecedor (frente C); o
 * token vai no fragmento (`/portaria/#<token>`), que o navegador não manda ao servidor nem
 * grava em log.
 */
const STANDALONE_PAGES = [
  { path: "/portaria", csp: PORTARIA_CSP },
  { path: "/fornecedor", csp: PAINEL_CSP },
] as const;

async function indexHtml(distDir: string): Promise<string | null> {
  const index = `${distDir}/index.html`;
  return existsSync(index) ? readFile(index, "utf8") : null;
}

const NOT_BUILT =
  "O painel ainda não foi compilado. Rode `pnpm --filter @casamento/api build` " +
  "(ou aguarde o `dev` terminar a primeira compilação) e recarregue a página.";

/** Serve o SPA do painel em /painel, com fallback para index.html nas rotas do cliente. */
export function painelRoutes(distDir: string = PAINEL_DIST) {
  const app = new Hono();

  for (const page of STANDALONE_PAGES) {
    app.get(page.path, (c) => c.redirect(`${page.path}/`, 301));
    app.get(`${page.path}/`, async (c) => {
      c.header("Content-Security-Policy", page.csp);
      c.header("Cache-Control", "no-store");
      c.header("Referrer-Policy", "no-referrer");
      const html = await indexHtml(distDir);
      return html === null ? c.text(NOT_BUILT, 503) : c.html(html);
    });
  }

  app.use("/painel/*", async (c, next) => {
    await next();
    c.res.headers.set("Content-Security-Policy", PAINEL_CSP);
  });

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
    const html = await indexHtml(distDir);
    if (html === null) return c.text(NOT_BUILT, 503);
    c.header("Cache-Control", "no-store");
    return c.html(html);
  });

  return app;
}
