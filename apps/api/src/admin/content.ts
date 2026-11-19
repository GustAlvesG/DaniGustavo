import {
  and,
  asc,
  byEvent,
  count,
  desc,
  eq,
  eventSettings,
  giftOrders,
  gifts,
  guests,
  invitations,
  messages,
  type Database,
} from "@casamento/db";
import {
  cardFeeCents,
  parseSettings,
  SETTINGS_KEYS,
  SettingsUpdate,
  type AdminMessage,
  type DashboardData,
} from "@casamento/shared";
import { Hono } from "hono";
import { cardFeePercent } from "../orders/service.ts";
import { resolverFor } from "../tenancy/resolver.ts";
import { eventBaseUrl } from "../tenancy/urls.ts";
import { buildSiteContent } from "../site-content.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv, EventCtx } from "../tenancy/types.ts";
import { invalid, notFound, readJson } from "./context.ts";
import type { AdminDeps } from "./context.ts";
import { invitationStatus } from "./invitations.ts";

/* ------------------------------------------------------------------------ */
/* Dashboard                                                                 */
/* ------------------------------------------------------------------------ */

export async function dashboard(ev: EventCtx, db: Database): Promise<DashboardData> {
  const [invs, gs, paid, pending, recent, deadlineRow, feePercent, pendingMsgs] = await Promise.all(
    [
      db.select({ id: invitations.id }).from(invitations).where(byEvent(invitations, ev)),
      db
        .select({
          invitationId: guests.invitationId,
          rsvpStatus: guests.rsvpStatus,
          isChild: guests.isChild,
          ageRange: guests.ageRange,
        })
        .from(guests)
        .where(byEvent(guests, ev)),
      db
        .select({
          amount: giftOrders.amountCents,
          fee: giftOrders.feeCents,
          method: giftOrders.method,
        })
        .from(giftOrders)
        .where(and(byEvent(giftOrders, ev), eq(giftOrders.status, "paid"))),
      db
        .select({ n: count() })
        .from(giftOrders)
        .where(and(byEvent(giftOrders, ev), eq(giftOrders.status, "pending"))),
      db
        .select({
          publicId: giftOrders.publicId,
          buyerName: giftOrders.buyerName,
          giftTitle: gifts.title,
          amount: giftOrders.amountCents,
          fee: giftOrders.feeCents,
          message: giftOrders.message,
          paidAt: giftOrders.paidAt,
        })
        .from(giftOrders)
        .innerJoin(gifts, and(eq(gifts.id, giftOrders.giftId), byEvent(gifts, ev)))
        .where(and(byEvent(giftOrders, ev), eq(giftOrders.status, "paid")))
        .orderBy(desc(giftOrders.paidAt))
        .limit(6),
      db
        .select()
        .from(eventSettings)
        .where(and(byEvent(eventSettings, ev), eq(eventSettings.key, "rsvp.deadline"))),
      cardFeePercent(ev, db),
      db
        .select({ n: count() })
        .from(messages)
        .where(and(byEvent(messages, ev), eq(messages.approved, false))),
    ],
  );

  const byInv = new Map<number, { rsvpStatus: (typeof gs)[number]["rsvpStatus"] }[]>();
  for (const g of gs) byInv.set(g.invitationId, [...(byInv.get(g.invitationId) ?? []), g]);
  const invitationCounts = { pending: 0, confirmed: 0, declined: 0, total: invs.length };
  for (const inv of invs) invitationCounts[invitationStatus(byInv.get(inv.id) ?? [])]++;

  const guestCounts = { pending: 0, confirmed: 0, declined: 0, total: gs.length };
  const attending: DashboardData["attending"] = {
    adults: 0,
    children: 0,
    childrenByAge: { "0-2": 0, "3-7": 0, "8-12": 0, "sem-faixa": 0 },
  };
  for (const g of gs) {
    guestCounts[g.rsvpStatus]++;
    if (g.rsvpStatus !== "confirmed") continue;
    if (g.isChild) {
      attending.children++;
      attending.childrenByAge[g.ageRange ?? "sem-faixa"]++;
    } else {
      attending.adults++;
    }
  }

  let grossCents = 0;
  let netCents = 0;
  for (const o of paid) {
    const gross = o.amount + o.fee;
    grossCents += gross;
    netCents += o.method === "card" ? gross - cardFeeCents(gross, feePercent) : gross;
  }

  return {
    invitations: invitationCounts,
    guests: guestCounts,
    attending,
    money: {
      grossCents,
      netCents,
      cardFeePercent: feePercent,
      paidOrders: paid.length,
      pendingOrders: pending[0]?.n ?? 0,
    },
    recentGifts: recent.map((r) => ({
      publicId: r.publicId,
      buyerName: r.buyerName,
      giftTitle: r.giftTitle,
      totalCents: r.amount + r.fee,
      message: r.message,
      paidAt: (r.paidAt ?? new Date(0)).toISOString(),
    })),
    rsvpDeadline: String(deadlineRow[0]?.value ?? ""),
    pendingMessages: pendingMsgs[0]?.n ?? 0,
  };
}

export function adminDashboardRoutes(deps: AdminDeps) {
  const app = new Hono<EventAdminEnv>();
  app.get("/", requirePermission("dashboard.read"), async (c) =>
    c.json(await dashboard(c.get("event"), deps.db)),
  );
  return app;
}

/* ------------------------------------------------------------------------ */
/* Recados                                                                   */
/* ------------------------------------------------------------------------ */

export function adminMessageRoutes(deps: AdminDeps) {
  const { db, revalidate } = deps;
  const app = new Hono<EventAdminEnv>();

  app.get("/", async (c) => {
    const ev = c.get("event");
    const filter = c.req.query("status");
    const rows = await db
      .select({ m: messages, giftTitle: gifts.title })
      .from(messages)
      .leftJoin(giftOrders, and(eq(giftOrders.id, messages.giftOrderId), byEvent(giftOrders, ev)))
      .leftJoin(gifts, and(eq(gifts.id, giftOrders.giftId), byEvent(gifts, ev)))
      .where(
        and(
          byEvent(messages, ev),
          filter === "pending"
            ? eq(messages.approved, false)
            : filter === "approved"
              ? eq(messages.approved, true)
              : undefined,
        ),
      )
      .orderBy(asc(messages.approved), desc(messages.createdAt))
      .limit(500);
    const list: AdminMessage[] = rows.map(({ m, giftTitle }) => ({
      id: m.id,
      author: m.author,
      body: m.body,
      approved: m.approved,
      giftTitle: giftTitle ?? null,
      createdAt: m.createdAt.toISOString(),
    }));
    return c.json({ messages: list });
  });

  app.patch("/:id{[0-9]+}", requirePermission("messages.moderate"), async (c) => {
    const ev = c.get("event");
    const body = (await readJson(c)) as { approved?: unknown } | undefined;
    if (typeof body?.approved !== "boolean") {
      return invalid(c, [{ message: "Informe approved: true ou false." }]);
    }
    const [res] = await db
      .update(messages)
      .set({ approved: body.approved })
      .where(and(eq(messages.id, Number(c.req.param("id"))), byEvent(messages, ev)));
    if (res.affectedRows === 0) return notFound(c, "Recado");
    await revalidate(ev.id, ["messages"]);
    return c.json({ ok: true });
  });

  return app;
}

/* ------------------------------------------------------------------------ */
/* Configurações                                                             */
/* ------------------------------------------------------------------------ */

export function adminSettingsRoutes(deps: AdminDeps) {
  const { db, revalidate, env } = deps;
  const app = new Hono<EventAdminEnv>();

  const readAll = async (ev: EventCtx) => {
    const rows = await db.select().from(eventSettings).where(byEvent(eventSettings, ev));
    return new Map(rows.map((r) => [r.key, { value: r.value, isPublic: r.isPublic }]));
  };

  app.get("/", async (c) => {
    const all = await readAll(c.get("event"));
    const values: Record<string, unknown> = {};
    for (const key of SETTINGS_KEYS) values[key] = all.get(key)?.value ?? null;
    return c.json({
      values,
      siteUrl: await eventBaseUrl(c.get("event"), {
        env,
        resolver: resolverFor(db, deps.eventResolver),
      }),
    });
  });

  app.put("/", requirePermission("settings.write"), async (c) => {
    const ev = c.get("event");
    const body = SettingsUpdate.safeParse(await readJson(c));
    if (!body.success) return invalid(c, body.error.issues);
    const parsed = parseSettings(body.data.values);
    if (!parsed.ok) return invalid(c, [{ message: parsed.message }]);

    // O conteúdo público inteiro precisa continuar válido (o site lê tudo de uma vez).
    const all = await readAll(ev);
    const merged = new Map<string, unknown>();
    for (const [k, v] of all) if (v.isPublic) merged.set(k, v.value);
    for (const [k, v] of Object.entries(parsed.data)) merged.set(k, v);
    try {
      buildSiteContent(merged);
    } catch {
      return invalid(c, [
        {
          message: "Com essas mudanças o site ficaria incompleto. Confira os campos obrigatórios.",
        },
      ]);
    }

    await db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(parsed.data)) {
        await tx
          .insert(eventSettings)
          .values({
            eventId: ev.id,
            key,
            value,
            isPublic: all.get(key)?.isPublic ?? true,
          })
          .onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
      }
    });
    await revalidate(ev.id, ["site", "gifts"]);
    return c.json({ ok: true, saved: Object.keys(parsed.data) });
  });

  return app;
}
