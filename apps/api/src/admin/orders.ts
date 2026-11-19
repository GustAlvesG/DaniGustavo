import {
  and,
  byEvent,
  desc,
  eq,
  giftOrders,
  gifts,
  like,
  or,
  payments,
  type SQL,
} from "@casamento/db";
import {
  AdminOrdersQuery,
  ERROR_CODES,
  type AdminOrder,
  type AdminOrderDetail,
} from "@casamento/shared";
import { Hono } from "hono";
import { apiError } from "../errors.ts";
import { reconcileOrders, refundOrder } from "../orders/reconcile.ts";
import type { GiftRow, OrderRow } from "../orders/service.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import { invalid, iso, notFound, sensitiveLimit } from "./context.ts";
import type { AdminDeps } from "./context.ts";

function orderDto(order: OrderRow, gift: Pick<GiftRow, "id" | "title">): AdminOrder {
  return {
    publicId: order.publicId,
    status: order.status,
    statusDetail: order.statusDetail,
    method: order.method,
    provider: order.provider,
    providerOrderId: order.providerOrderId,
    gift: { id: gift.id, title: gift.title },
    quantity: order.quantity,
    amountCents: order.amountCents,
    feeCents: order.feeCents,
    totalCents: order.amountCents + order.feeCents,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    message: order.message,
    showOnWall: order.showOnWall,
    createdAt: order.createdAt.toISOString(),
    expiresAt: order.expiresAt.toISOString(),
    paidAt: iso(order.paidAt),
  };
}

export function adminOrderRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<EventAdminEnv>();
  app.get("*", requirePermission("orders.read"));

  app.get("/", async (c) => {
    const ev = c.get("event");
    const parsed = AdminOrdersQuery.safeParse(c.req.query());
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const { status, method, q } = parsed.data;
    const where: SQL[] = [byEvent(giftOrders, ev)];
    if (status) where.push(eq(giftOrders.status, status));
    if (method) where.push(eq(giftOrders.method, method));
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      where.push(
        or(
          like(giftOrders.buyerName, pattern),
          like(giftOrders.buyerEmail, pattern),
          like(giftOrders.publicId, pattern),
          like(gifts.title, pattern),
        )!,
      );
    }
    const rows = await db
      .select({ order: giftOrders, gift: { id: gifts.id, title: gifts.title } })
      .from(giftOrders)
      .innerJoin(gifts, and(eq(gifts.id, giftOrders.giftId), byEvent(gifts, ev)))
      .where(and(...where))
      .orderBy(desc(giftOrders.createdAt))
      .limit(300);
    return c.json({ orders: rows.map((r) => orderDto(r.order, r.gift)) });
  });

  app.post(
    "/reconcile",
    requirePermission("orders.reconcile"),
    sensitiveLimit(deps.limiter, "reconcile"),
    async (c) => {
      const result = await reconcileOrders(c.get("event"), deps);
      if (result.changed.length) await deps.revalidate(c.get("event").id, ["gifts"]);
      return c.json(result);
    },
  );

  app.get("/:publicId", async (c) => {
    const ev = c.get("event");
    const [row] = await db
      .select({ order: giftOrders, gift: { id: gifts.id, title: gifts.title } })
      .from(giftOrders)
      .innerJoin(gifts, and(eq(gifts.id, giftOrders.giftId), byEvent(gifts, ev)))
      .where(and(eq(giftOrders.publicId, c.req.param("publicId")), byEvent(giftOrders, ev)));
    if (!row) return notFound(c, "Pedido");
    const pays = await db
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, row.order.id), byEvent(payments, ev)));
    const detail: AdminOrderDetail = {
      ...orderDto(row.order, row.gift),
      payments: pays.map((p) => ({
        gatewayId: p.gatewayId,
        method: p.method,
        gatewayStatus: p.gatewayStatus,
        grossCents: p.grossCents,
        createdAt: p.createdAt.toISOString(),
      })),
      canRefund: row.order.status === "paid" && !!row.order.providerOrderId,
    };
    return c.json({ order: detail });
  });

  app.post(
    "/:publicId/refund",
    requirePermission("orders.refund"),
    sensitiveLimit(deps.limiter, "refund"),
    async (c) => {
      const publicId = c.req.param("publicId");
      const result = await refundOrder(c.get("event"), deps, publicId);
      if (!result.ok) {
        const code = result.status === 502 ? ERROR_CODES.paymentFailed : ERROR_CODES.invalidRequest;
        return apiError(
          c,
          result.status,
          result.status === 404 ? ERROR_CODES.notFound : code,
          result.message,
        );
      }
      console.log(`[painel] Pedido ${publicId} reembolsado por ${c.get("user").id}.`);
      await deps.revalidate(c.get("event").id, ["gifts", "messages"]);
      return c.json({ ok: true, status: result.order?.status ?? "refunded" });
    },
  );

  return app;
}
