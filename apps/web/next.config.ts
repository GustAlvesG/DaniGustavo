import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";

/**
 * Um único `.env` na raiz do monorepo (CLAUDE.md). O Next só lê `.env` da
 * pasta do app, então carregamos o da raiz aqui, antes do build/dev começar,
 * sem sobrescrever o que já veio do ambiente (CI, Vercel, shell).
 */
function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 5 && !existsSync(join(dir, "pnpm-workspace.yaml")); i++) {
    const up = dirname(dir);
    if (up === dir) return;
    dir = up;
  }
  const file = join(dir, ".env");
  if (!existsSync(file)) return;
  const parsed = parseEnv(readFileSync(file, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}

loadRootEnv();

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // O pacote do workspace exporta .ts cru (sem build). O Turbopack já o
  // compila sozinho; a lista deixa isso explícito (e vale para o webpack).
  transpilePackages: ["@casamento/shared"],
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
