import {
  and,
  byEvent,
  count,
  eq,
  eventDeletions,
  eventMedia,
  events,
  giftOrders,
  guests,
  inArray,
  invitations,
  messages,
  payments,
  sql,
  vendorContracts,
  type Database,
} from "@casamento/db";
import {
  EVENT_DELETION_ORDER_WINDOW_DAYS,
  type DeletionBlocker,
  type EventDeletionPreview,
} from "@casamento/shared";
import type { Storage } from "../storage/index.ts";
import type { EventCtx } from "../tenancy/types.ts";

/*
 * Apagar evento (Fase 6, docs/saas/fase-6.md §3). Só evento arquivado, sem pedido pendente e sem
 * pedido pago/reembolsado nos últimos EVENT_DELETION_ORDER_WINDOW_DAYS (janela de contestação).
 * Fica só o resumo sem dado pessoal em `event_deletions`.
 */

const DAY_MS = 24 * 60 * 60_000;

export interface DeletionCheck {
  preview: EventDeletionPreview;
  /** Mensagem do primeiro bloqueio (para o 409), ou null. */
  blocked: { code: DeletionBlocker; message: string } | null;
}

const formatDay = (d: Date) =>
  d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long" });

export async function checkEventDeletion(
  ev: EventCtx,
  db: Database,
  now: Date,
): Promise<DeletionCheck> {
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [inv, gst, ord, msg, media, contracts] = await Promise.all([
    n(db.select({ n: count() }).from(invitations).where(byEvent(invitations, ev))),
    n(db.select({ n: count() }).from(guests).where(byEvent(guests, ev))),
    n(db.select({ n: count() }).from(giftOrders).where(byEvent(giftOrders, ev))),
    n(db.select({ n: count() }).from(messages).where(byEvent(messages, ev))),
    n(db.select({ n: count() }).from(eventMedia).where(byEvent(eventMedia, ev))),
    n(db.select({ n: count() }).from(vendorContracts).where(byEvent(vendorContracts, ev))),
  ]);

  const blockers: EventDeletionPreview["blockers"] = [];
  if (ev.status !== "archived") {
    blockers.push({
      code: "not_archived",
      message: "Arquive o evento antes de apagar. Evento arquivado sai do ar para os convidados.",
    });
  }
  const pending = await n(
    db
      .select({ n: count() })
      .from(giftOrders)
      .where(and(byEvent(giftOrders, ev), eq(giftOrders.status, "pending"))),
  );
  if (pending > 0) {
    blockers.push({
      code: "pending_orders",
      message: `Há ${pending === 1 ? "1 pedido pendente" : `${pending} pedidos pendentes`}. Espere o pagamento ou a expiração (até 30 minutos) e tente de novo.`,
    });
  }

  // Último movimento de dinheiro: pagamento ou reembolso (o reembolso atualiza o pedido).
  const settled = await db
    .select({ paidAt: giftOrders.paidAt, updatedAt: giftOrders.updatedAt })
    .from(giftOrders)
    .where(and(byEvent(giftOrders, ev), inArray(giftOrders.status, ["paid", "refunded"])));
  let last = 0;
  for (const o of settled) {
    last = Math.max(last, o.paidAt?.getTime() ?? 0, o.updatedAt.getTime());
  }
  const freeAt = last ? new Date(last + EVENT_DELETION_ORDER_WINDOW_DAYS * DAY_MS) : null;
  let deletableFrom: string | null = null;
  if (freeAt && freeAt.getTime() > now.getTime()) {
    deletableFrom = freeAt.toISOString();
    blockers.push({
      code: "recent_orders",
      message: `Há presentes pagos ou reembolsados há menos de ${EVENT_DELETION_ORDER_WINDOW_DAYS} dias (prazo de contestação do cartão e do Pix). Dá para apagar a partir de ${formatDay(freeAt)}.`,
    });
  }

  return {
    preview: {
      eventId: ev.id,
      slug: ev.slug,
      name: ev.name,
      counts: {
        invitations: inv,
        guests: gst,
        orders: ord,
        messages: msg,
        media,
        contracts,
      },
      blockers,
      deletableFrom,
    },
    blocked: blockers[0] ?? null,
  };
}

export interface DeleteEventDeps {
  db: Database;
  storage: Storage;
  now: Date;
  userId: string;
}

/**
 * Apaga o evento numa transação (resumo → pagamentos → pedidos → evento, o resto em cascata) e
 * depois a pasta do Storage (inclusive `private/`). Quem chama já conferiu os bloqueios.
 */
export async function deleteEvent(ev: EventCtx, deps: DeleteEventDeps): Promise<boolean> {
  const { db, storage, now, userId } = deps;
  const done = await db.transaction(async (tx) => {
    // Trava a linha do evento: duas exclusões ao mesmo tempo não gravam dois resumos.
    const [locked] = await tx
      .select({ id: events.id, status: events.status })
      .from(events)
      .where(and(eq(events.id, ev.id), eq(events.organizationId, ev.orgId)))
      .for("update");
    // Conferido de novo dentro da trava (o contexto vem do cache do resolver).
    if (locked?.status !== "archived") return false;

    const [paid] = await tx
      .select({
        orders: count(),
        total:
          sql<number>`coalesce(sum(${giftOrders.amountCents} + ${giftOrders.feeCents}), 0)`.mapWith(
            Number,
          ),
        fee: sql<number>`coalesce(sum(coalesce(${giftOrders.platformFeeCents}, 0)), 0)`.mapWith(
          Number,
        ),
      })
      .from(giftOrders)
      .where(and(byEvent(giftOrders, ev), eq(giftOrders.status, "paid")));

    await tx.insert(eventDeletions).values({
      organizationId: ev.orgId,
      formerEventId: ev.id,
      slug: ev.slug,
      name: ev.name,
      type: ev.type,
      ordersCount: paid?.orders ?? 0,
      paidTotalCents: Number(paid?.total ?? 0),
      platformFeeCents: Number(paid?.fee ?? 0),
      deletedBy: userId,
      deletedAt: now,
    });
    // FK restrict para events: saem antes; recados de presente ficam sem o pedido (set null) e
    // saem na cascata do evento.
    await tx.delete(payments).where(byEvent(payments, ev));
    await tx.delete(giftOrders).where(byEvent(giftOrders, ev));
    await tx.delete(events).where(and(eq(events.id, ev.id), eq(events.organizationId, ev.orgId)));
    return true;
  });
  if (done) await storage.deleteEvent(ev.id);
  return done;
}
