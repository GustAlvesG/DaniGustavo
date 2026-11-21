import {
  and,
  byEvent,
  count,
  desc,
  eq,
  events,
  giftOrders,
  guests,
  inArray,
  invitations,
  like,
  or,
  privacyRequests,
  type Database,
} from "@casamento/db";
import {
  AnonymizeInput,
  PRIVACY_NOTICE_VERSION,
  PRIVACY_REQUEST_STATUSES,
  PrivacyRequestUpdate,
  PrivacySettings,
  type AnonymizeResult,
  type PrivacyOverview,
  type PrivacyRequestStatus,
  type PrivacyRequestView,
  type PrivacySubjectsResponse,
} from "@casamento/shared";
import { Hono } from "hono";
import { buildPrivacyResponseEmail } from "../privacy-email.ts";
import { anonymizeInvitations, anonymizeOrders } from "../privacy/anonymize.ts";
import { exportEventData, exportToCsv } from "../privacy/export.ts";
import { loadPrivacySettings, retentionDueAt, savePrivacySettings } from "../privacy/settings.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv, EventCtx } from "../tenancy/types.ts";
import { invalid, iso, notFound, readJson, type AdminDeps } from "./context.ts";

type RequestRow = typeof privacyRequests.$inferSelect;

const toView = (r: RequestRow): PrivacyRequestView => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  email: r.email,
  message: r.message,
  status: r.status,
  response: r.response,
  resolvedAt: iso(r.resolvedAt),
  createdAt: r.createdAt.toISOString(),
});

/** "1,2,3" → [1, 2, 3] (ignora o que não for id); ausente → undefined. */
function idList(value: string | undefined): number[] | undefined {
  if (value === undefined) return undefined;
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => /^[1-9]\d{0,15}$/.test(v))
    .map(Number)
    .slice(0, 500);
}

async function purgedAt(ev: EventCtx, db: Database): Promise<Date | null> {
  const [row] = await db
    .select({ at: events.personalDataPurgedAt })
    .from(events)
    .where(eq(events.id, ev.id));
  return row?.at ?? null;
}

/*
 * Fase 6, frente C (docs/saas/fase-6.md): LGPD do evento, em /api/admin/events/:eventId/privacy.
 *
 * - GET   /                  → PrivacyOverview                                  (privacy.read)
 * - PUT   /settings          PrivacySettings → { settings }                      (privacy.manage)
 * - GET   /requests          ?status= → { requests: PrivacyRequestView[] }        (privacy.read)
 * - PATCH /requests/:id      PrivacyRequestUpdate → { request }                  (privacy.manage)
 * - GET   /subjects          ?q= → PrivacySubjectsResponse (onde o titular aparece) (privacy.read)
 * - POST  /anonymize         AnonymizeInput → AnonymizeResult                    (privacy.manage)
 * - GET   /export            ?invitationIds=&orderIds=&format=csv → anexo JSON/CSV com convites,
 *   convidados, pedidos, recados e pedidos de titular do evento (ou só os do titular escolhido);
 *   sem segredos nem ids do provedor                                         (privacy.manage)
 */
export function adminPrivacyRoutes(deps: AdminDeps) {
  const { db, now, mailer } = deps;
  const app = new Hono<EventAdminEnv>();
  const revalidate = async (ev: EventCtx, tags: ("site" | "messages")[]) => {
    await deps.revalidate(ev.id, tags).catch((err: unknown) => {
      console.error("[privacidade] Falha ao revalidar o site:", err);
    });
  };

  app.get("/", requirePermission("privacy.read"), async (c) => {
    const ev = c.get("event");
    const [settings, [open], purged] = await Promise.all([
      loadPrivacySettings(ev, db),
      db
        .select({ n: count() })
        .from(privacyRequests)
        .where(and(byEvent(privacyRequests, ev), eq(privacyRequests.status, "open"))),
      purgedAt(ev, db),
    ]);
    const body: PrivacyOverview = {
      settings,
      openRequests: open?.n ?? 0,
      noticeVersion: PRIVACY_NOTICE_VERSION,
      purgedAt: iso(purged),
      retentionDueAt: iso(retentionDueAt(ev.startsAt, settings)),
    };
    return c.json(body);
  });

  app.put("/settings", requirePermission("privacy.manage"), async (c) => {
    const ev = c.get("event");
    const parsed = PrivacySettings.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    await savePrivacySettings(ev, db, parsed.data);
    // O aviso público (contato, exigência do aceite) entra no cache do site.
    await revalidate(ev, ["site"]);
    return c.json({ settings: parsed.data });
  });

  app.get("/requests", requirePermission("privacy.read"), async (c) => {
    const ev = c.get("event");
    const status = c.req.query("status");
    const filter = (PRIVACY_REQUEST_STATUSES as readonly string[]).includes(status ?? "")
      ? eq(privacyRequests.status, status as PrivacyRequestStatus)
      : undefined;
    const rows = await db
      .select()
      .from(privacyRequests)
      .where(and(byEvent(privacyRequests, ev), filter))
      .orderBy(desc(privacyRequests.createdAt), desc(privacyRequests.id))
      .limit(500);
    return c.json({ requests: rows.map(toView) });
  });

  app.patch("/requests/:requestId{[0-9]+}", requirePermission("privacy.manage"), async (c) => {
    const ev = c.get("event");
    const id = Number(c.req.param("requestId"));
    const parsed = PrivacyRequestUpdate.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const where = and(byEvent(privacyRequests, ev), eq(privacyRequests.id, id));
    const [current] = await db.select().from(privacyRequests).where(where);
    if (!current) return notFound(c, "Pedido");
    const moment = now();
    const response = parsed.data.response || null;
    await db
      .update(privacyRequests)
      .set({
        status: parsed.data.status,
        response,
        resolvedBy: c.get("user").id,
        resolvedAt: moment,
        updatedAt: moment,
      })
      .where(where);
    const [updated] = await db.select().from(privacyRequests).where(where);
    // Resposta ao titular por e-mail (sem await: o painel não espera o SMTP).
    void mailer
      .send(
        buildPrivacyResponseEmail({
          to: current.email,
          eventName: ev.name,
          name: current.name,
          status: parsed.data.status,
          response,
        }),
      )
      .catch((err: unknown) => {
        console.error("[privacidade] Falha ao responder o titular por e-mail:", err);
      });
    return c.json({ request: toView(updated!) });
  });

  app.get("/subjects", requirePermission("privacy.read"), async (c) => {
    const ev = c.get("event");
    const q = (c.req.query("q") ?? "").trim().slice(0, 120);
    const body: PrivacySubjectsResponse = { invitations: [], orders: [] };
    if (q.length < 2) return c.json(body);
    const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

    const byGuest = await db
      .select({ invitationId: guests.invitationId })
      .from(guests)
      .where(and(byEvent(guests, ev), or(like(guests.name, pattern), like(guests.email, pattern))))
      .limit(100);
    const invRows = await db
      .select()
      .from(invitations)
      .where(
        and(
          byEvent(invitations, ev),
          or(
            like(invitations.label, pattern),
            like(invitations.contactEmail, pattern),
            byGuest.length
              ? inArray(
                  invitations.id,
                  byGuest.map((g) => g.invitationId),
                )
              : undefined,
          ),
        ),
      )
      .limit(50);
    const guestRows = invRows.length
      ? await db
          .select({ invitationId: guests.invitationId, name: guests.name })
          .from(guests)
          .where(
            and(
              byEvent(guests, ev),
              inArray(
                guests.invitationId,
                invRows.map((i) => i.id),
              ),
            ),
          )
      : [];
    body.invitations = invRows.map((inv) => ({
      id: inv.id,
      label: inv.label,
      guests: guestRows.filter((g) => g.invitationId === inv.id).map((g) => g.name),
      contactEmail: inv.contactEmail,
      anonymized: inv.anonymizedAt !== null,
    }));

    const orderRows = await db
      .select()
      .from(giftOrders)
      .where(
        and(
          byEvent(giftOrders, ev),
          or(like(giftOrders.buyerName, pattern), like(giftOrders.buyerEmail, pattern)),
        ),
      )
      .orderBy(desc(giftOrders.createdAt))
      .limit(50);
    body.orders = orderRows.map((o) => ({
      id: o.id,
      publicId: o.publicId,
      buyerName: o.buyerName,
      buyerEmail: o.buyerEmail,
      status: o.status,
      amountCents: o.amountCents + o.feeCents,
      createdAt: o.createdAt.toISOString(),
      anonymized: o.anonymizedAt !== null,
    }));
    return c.json(body);
  });

  app.post("/anonymize", requirePermission("privacy.manage"), async (c) => {
    const ev = c.get("event");
    const parsed = AnonymizeInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const moment = now();
    const result: AnonymizeResult = await db.transaction(async (tx) => ({
      invitations: await anonymizeInvitations(ev, tx, parsed.data.invitationIds, moment),
      orders: await anonymizeOrders(ev, tx, parsed.data.orderIds, moment),
    }));
    // Recado que veio com o pedido sai do mural.
    if (result.orders > 0) await revalidate(ev, ["messages"]);
    return c.json(result);
  });

  app.get("/export", requirePermission("privacy.manage"), async (c) => {
    const ev = c.get("event");
    const invitationIds = idList(c.req.query("invitationIds"));
    const orderIds = idList(c.req.query("orderIds"));
    const data = await exportEventData(ev, db, now(), { invitationIds, orderIds });
    const subject = data.scope === "subject";
    const base = `dados-${ev.slug}${subject ? "-titular" : ""}`;
    if (c.req.query("format") === "csv") {
      return c.body(exportToCsv(data), 200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.csv"`,
      });
    }
    return c.body(JSON.stringify(data, null, 2), 200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.json"`,
    });
  });

  return app;
}
