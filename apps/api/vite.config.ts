import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// SPA do painel: código em painel/, build em dist/painel, servido pelo Hono em /painel.
export default defineConfig({
  root: fileURLToPath(new URL("./painel", import.meta.url)),
  base: "/painel/",
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("./dist/painel", import.meta.url)),
    emptyOutDir: true,
  },
});
