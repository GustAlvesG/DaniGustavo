import { EventDeletionInput } from "@casamento/shared";
import { Hono } from "hono";
import { apiError, ERROR_CODES } from "../../errors.ts";
import { checkEventDeletion, deleteEvent } from "../../privacy/event-deletion.ts";
import { exportEventData, exportToCsv } from "../../privacy/export.ts";
import type { OrgEventEnv } from "../../tenancy/org-access.ts";
import { requireOrgPermission } from "../../tenancy/org-access.ts";
import { resolverFor } from "../../tenancy/resolver.ts";
import { invalid, readJson, type AdminDeps } from "../context.ts";

/*
 * Fase 6, frente C (docs/saas/fase-6.md §3 "Apagar evento"): em
 * /api/admin/orgs/:orgId/events/:eventId/deletion (depois de requireOrgEvent). Só o dono
 * (events.delete); membro → 403; evento de outra organização → 404 de rota.
 *
 * - GET  /         → EventDeletionPreview (o que sai e o que impede)
 * - GET  /export   ?format=csv → anexo com os dados do evento (guardar antes de apagar)
 * - POST /         EventDeletionInput → { ok: true }. Slug diferente → 422; evento não
 *   arquivado, pedido pendente ou pedido pago/reembolsado nos últimos
 *   EVENT_DELETION_ORDER_WINDOW_DAYS → 409 com o motivo (e `deletableFrom` no preview). Em
 *   transação: resumo em `event_deletions`, payments/gift_orders (FK restrict) e o evento
 *   (cascata no resto); depois `storage.deleteEvent` (inclusive `private/`), invalida o resolver
 *   e revalida o site.
 */
export function orgEventDeletionRoutes(deps: AdminDeps) {
  const { db, now } = deps;
  const app = new Hono<OrgEventEnv>();
  const resolver = resolverFor(db, deps.eventResolver);

  app.get("/", requireOrgPermission("events.delete"), async (c) => {
    const { preview } = await checkEventDeletion(c.get("event"), db, now());
    return c.json(preview);
  });

  app.get("/export", requireOrgPermission("events.delete"), async (c) => {
    const ev = c.get("event");
    const data = await exportEventData(ev, db, now());
    if (c.req.query("format") === "csv") {
      return c.body(exportToCsv(data), 200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="dados-${ev.slug}.csv"`,
      });
    }
    return c.body(JSON.stringify(data, null, 2), 200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="dados-${ev.slug}.json"`,
    });
  });

  app.post("/", requireOrgPermission("events.delete"), async (c) => {
    const ev = c.get("event");
    const parsed = EventDeletionInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    if (parsed.data.confirmSlug !== ev.slug) {
      return c.json(
        {
          error: {
            code: ERROR_CODES.invalidRequest,
            message: `Para confirmar, digite exatamente o endereço do evento: ${ev.slug}`,
            field: "confirmSlug",
          },
        },
        422,
      );
    }
    const moment = now();
    const { blocked } = await checkEventDeletion(ev, db, moment);
    if (blocked) return apiError(c, 409, ERROR_CODES.conflict, blocked.message);

    const deleted = await deleteEvent(ev, {
      db,
      storage: deps.storage,
      now: moment,
      userId: c.get("user").id,
    });
    resolver.invalidate(ev.id);
    if (!deleted) {
      return apiError(
        c,
        409,
        ERROR_CODES.conflict,
        "O evento mudou de situação. Recarregue a página.",
      );
    }
    await deps.revalidate(ev.id, ["site", "gifts", "messages"]).catch((err: unknown) => {
      console.error("[privacidade] Falha ao revalidar o site do evento apagado:", err);
    });
    return c.json({ ok: true });
  });

  return app;
}
