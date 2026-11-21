import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";
import { siteSecurityHeaders } from "./src/lib/security-headers";

/**
 * Um único `.env` na raiz do monorepo (CLAUDE.md). O Next só lê `.env` da
 * pasta do app, então carregamos o da raiz aqui, antes do build/dev começar,
 * sem sobrescrever o que já veio do ambiente (CI, Vercel, shell).
 */
function findRepoRoot(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 5 && !existsSync(join(dir, "pnpm-workspace.yaml")); i++) {
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  return existsSync(join(dir, "pnpm-workspace.yaml")) ? dir : null;
}

const repoRoot = findRepoRoot();

function loadRootEnv(): void {
  if (!repoRoot) return;
  const file = join(repoRoot, ".env");
  if (!existsSync(file)) return;
  const parsed = parseEnv(readFileSync(file, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}

loadRootEnv();

const nextConfig: NextConfig = {
  // Pasta de build alternativa (ex.: NEXT_DIST_DIR=.next-e2e): permite um segundo `next dev`
  // ao lado do que já está aberto, sem brigar pelo lock nem pelo cache de .next.
  distDir: process.env.NEXT_DIST_DIR || undefined,
  // Produção em Docker (NEXT_OUTPUT=standalone, ver Dockerfile): o build gera
  // .next/standalone com um server.js e só os node_modules usados. Fora do Docker fica
  // como antes (`next start` não funciona com standalone).
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Monorepo: o rastreio de arquivos parte da raiz, para levar packages/shared e o
  // node_modules do pnpm; por isso o server.js fica em apps/web/ dentro do standalone.
  outputFileTracingRoot: repoRoot ?? undefined,
  cacheComponents: true,
  partialPrefetching: true,
  // O pacote do workspace exporta .ts cru (sem build). O Turbopack já o
  // compila sozinho; a lista deixa isso explícito (e vale para o webpack).
  transpilePackages: ["@casamento/shared"],
  // Fotos que o next/image otimiza: só as do evento (`/uploads/<evento>/...`, repassadas à
  // API). Qualquer outro caminho → 400.
  images: {
    localPatterns: [{ pathname: "/uploads/**", search: "" }],
  },
  // Fotos dos presentes enviadas pelo painel ficam na API: o site as repassa em /uploads
  // (proxy no servidor, a URL da API não vai para o navegador).
  async rewrites() {
    const api = process.env.API_URL?.replace(/\/+$/, "");
    return api ? [{ source: "/uploads/:path*", destination: `${api}/uploads/:path*` }] : [];
  },
  async headers() {
    return [
      // Fase 6: CSP e cabeçalhos de segurança em tudo (por que sem nonce: lib/security-headers.ts).
      {
        source: "/:path*",
        headers: siteSecurityHeaders({ dev: process.env.NODE_ENV === "development" }),
      },
      // O service worker nunca fica em cache do navegador: uma versão nova vale na hora.
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
  turbopack: {
    rules: {
      // Tailwind só no CSS global do app: com `as: "*.css"`, um *.module.css
      // virava CSS global e as classes do módulo chegavam vazias.
      "*.css": {
        condition: { not: { any: [{ path: /\.module\.css$/ }, "foreign"] } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
