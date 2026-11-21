import { Hono } from "hono";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import type { AdminDeps } from "./context.ts";
import { notYet } from "./stub.ts";

/*
 * Fase 7, frente D (docs/saas/fase-7.md): WhatsApp por links prontos, em
 * /api/admin/events/:eventId/whatsapp. Contratos em @casamento/shared › whatsapp.
 *
 * - GET    /templates            → WhatsappTemplatesResponse                    (whatsapp.send)
 * - PUT    /templates/:kind      WhatsappTemplateUpdate → { template }          (whatsapp.send)
 * - GET    /queue?kind=&filter=  → WhatsappQueueResponse                        (whatsapp.send)
 * - POST   /sends                WhatsappSendMark → { marked }                  (whatsapp.send)
 * - DELETE /sends/:sendId        → { ok } (desfaz a marcação)                   (whatsapp.send)
 */
export function adminWhatsappRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono<EventAdminEnv>();
  const soon = "WhatsApp";
  app.get("/templates", requirePermission("whatsapp.send"), (c) => notYet(c, soon));
  app.put("/templates/:kind", requirePermission("whatsapp.send"), (c) => notYet(c, soon));
  app.get("/queue", requirePermission("whatsapp.send"), (c) => notYet(c, soon));
  app.post("/sends", requirePermission("whatsapp.send"), (c) => notYet(c, soon));
  app.delete("/sends/:sendId{[0-9]+}", requirePermission("whatsapp.send"), (c) => notYet(c, soon));
  return app;
}
