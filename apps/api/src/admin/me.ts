import { Hono } from "hono";
import type { AdminDeps, AdminEnv } from "./context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 6, frente C: dados da própria conta (LGPD), em /api/admin/me.
 *
 * - GET    /export  → MyDataExport (attachment)
 * - DELETE /        → { ok } apaga a própria conta (sessões, vínculos); recusado (409) se for o
 *   único dono de uma organização com evento, ou titular de subconta de recebimento ativa.
 */
export function adminMeRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<AdminEnv>();
  const soon = "Meus dados";
  app.get("/export", (c) => notYet(c, soon));
  app.delete("/", (c) => notYet(c, soon));
  return app;
}
