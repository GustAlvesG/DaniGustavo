import { Hono } from "hono";
import type { AdminDeps } from "../admin/context.ts";
import { notYet } from "../admin/stub.ts";

/*
 * Fase 7, frente C (docs/saas/fase-7.md): portal do fornecedor, sem conta, em
 * /api/vendor-portal. Isento de X-Web-Key (web-key.ts): o navegador do fornecedor chama com
 * `Authorization: Bearer <token do link>` (sem cookie, sem CSRF). Link achado pelo SHA-256 do
 * token dentro de `crossEvent`; expirado/revogado → 401 (mesma resposta de inexistente); rate
 * limit por IP. Daí em diante tudo filtra pelo evento e pelo `event_vendor_id` do link.
 *
 * - GET  /me                         → VendorPortalMe
 * - GET  /schedule                   → VendorPortalSchedule (itens dos outros sem detalhes)
 * - GET  /tasks                      → { tasks: VendorPortalTask[] }
 * - GET  /quotes                     → { quotes: VendorPortalQuote[] } (só os dele)
 * - POST /quotes                     VendorPortalQuoteInput → { quote } ("received", portal)
 * - GET  /documents                  → { documents: VendorPortalDocument[] }
 * - POST /documents                  multipart (file + title) → { document } (tipo pelos bytes,
 *   CONTRACT_MAX_BYTES, limite de espaço do plano; área privada do Storage)
 * - GET  /documents/:documentId/file → arquivo (attachment + nosniff; só os do fornecedor)
 */
export function vendorPortalRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono();
  const soon = "Portal do fornecedor";
  app.get("/me", (c) => notYet(c, soon));
  app.get("/schedule", (c) => notYet(c, soon));
  app.get("/tasks", (c) => notYet(c, soon));
  app.get("/quotes", (c) => notYet(c, soon));
  app.post("/quotes", (c) => notYet(c, soon));
  app.get("/documents", (c) => notYet(c, soon));
  app.post("/documents", (c) => notYet(c, soon));
  app.get("/documents/:documentId{[0-9]+}/file", (c) => notYet(c, soon));
  return app;
}
