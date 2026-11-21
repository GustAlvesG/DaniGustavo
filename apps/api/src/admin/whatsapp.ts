import {
  WHATSAPP_QUEUE_FILTERS,
  WHATSAPP_TEMPLATE_KINDS,
  WHATSAPP_VARIABLES,
  WhatsappSendMark,
  WhatsappTemplateKind,
  WhatsappTemplateUpdate,
  type WhatsappQueueFilter,
  type WhatsappTemplatesResponse,
} from "@casamento/shared";
import { Hono } from "hono";
import { apiError, ERROR_CODES } from "../errors.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import { resolverFor } from "../tenancy/resolver.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import { eventBaseUrl } from "../tenancy/urls.ts";
import {
  buildQueue,
  loadTemplates,
  markSent,
  saveTemplate,
  unmarkSent,
} from "../whatsapp/service.ts";
import { invalid, notFound, readJson } from "./context.ts";
import type { AdminDeps } from "./context.ts";

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
  const { db, env } = deps;
  const resolver = resolverFor(db, deps.eventResolver);
  const app = new Hono<EventAdminEnv>();
  const need = requirePermission("whatsapp.send");

  app.get("/templates", need, async (c) => {
    const body: WhatsappTemplatesResponse = {
      templates: await loadTemplates(c.get("event"), db),
      variables: WHATSAPP_VARIABLES,
    };
    return c.json(body);
  });

  app.put("/templates/:kind", need, async (c) => {
    const kind = WhatsappTemplateKind.safeParse(c.req.param("kind"));
    if (!kind.success) return notFound(c, "Modelo");
    const body = WhatsappTemplateUpdate.safeParse(await readJson(c));
    if (!body.success) return invalid(c, body.error.issues);
    return c.json({ template: await saveTemplate(c.get("event"), db, kind.data, body.data.body) });
  });

  app.get("/queue", need, async (c) => {
    const kind = WhatsappTemplateKind.safeParse(c.req.query("kind") ?? WHATSAPP_TEMPLATE_KINDS[0]);
    if (!kind.success) {
      return apiError(c, 422, ERROR_CODES.invalidRequest, "Tipo de mensagem inválido.");
    }
    const rawFilter = c.req.query("filter") ?? "not_sent";
    if (!(WHATSAPP_QUEUE_FILTERS as readonly string[]).includes(rawFilter)) {
      return apiError(c, 422, ERROR_CODES.invalidRequest, "Filtro inválido.");
    }
    const ev = c.get("event");
    const baseUrl = await eventBaseUrl(ev, { env, resolver });
    return c.json(await buildQueue(ev, db, baseUrl, kind.data, rawFilter as WhatsappQueueFilter));
  });

  app.post("/sends", need, async (c) => {
    const body = WhatsappSendMark.safeParse(await readJson(c));
    if (!body.success) return invalid(c, body.error.issues);
    const marked = await markSent(
      c.get("event"),
      db,
      c.get("user").id,
      body.data.kind,
      body.data.invitationIds,
    );
    if (marked === null) return notFound(c, "Convite");
    return c.json({ marked }, 201);
  });

  app.delete("/sends/:sendId{[0-9]+}", need, async (c) => {
    const ok = await unmarkSent(c.get("event"), db, Number(c.req.param("sendId")));
    if (!ok) return notFound(c, "Marcação");
    return c.json({ ok: true });
  });

  return app;
}
