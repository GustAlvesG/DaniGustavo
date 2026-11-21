import { and, byEvent, eq, giftOrders, gt, isNotNull, messages, or } from "@casamento/db";
import type { ReconcileResult } from "@casamento/shared";
import {
  PaymentProviderError,
  type ChargeSnapshot,
  type PaymentProvider,
} from "../payments/index.ts";
import { crossEvent } from "../tenancy/cross-event.ts";
import type { EventCtx } from "../tenancy/types.ts";
import {
  applyCharge,
  eventOfOrder,
  orderProvider,
  type OrderDeps,
  type OrderRow,
} from "./service.ts";

/** Quantos dias para trás a conciliação revisa pedidos já resolvidos. */
export const RECONCILE_DAYS = 3;

/**
 * Conciliação (PROMPT §6): consulta no provedor os pedidos pendentes e os recentes e corrige
 * divergências pelo mesmo caminho do webhook (`applyCharge`). Pega, por exemplo, um Pix pago
 * cujo webhook se perdeu ou um reembolso feito direto no painel do provedor.
 *
 * Com `ev`, só os pedidos daquele evento (botão do painel); sem, todos os eventos (rotina
 * diária, numa busca em crossEvent; cada pedido segue no seu evento).
 *
 * Fase 5: cada pedido é consultado na conta em que foi cobrado (principal ou subconta); o
 * provedor de cada conta é montado uma vez por rodada.
 */
export async function reconcileOrders(
  ev: EventCtx | null,
  deps: OrderDeps,
): Promise<ReconcileResult> {
  const since = new Date(deps.now().getTime() - RECONCILE_DAYS * 24 * 60 * 60_000);
  const filter = and(
    isNotNull(giftOrders.providerOrderId),
    or(eq(giftOrders.status, "pending"), gt(giftOrders.updatedAt, since)),
  );
  const rows = ev
    ? await deps.db
        .select()
        .from(giftOrders)
        .where(and(byEvent(giftOrders, ev), filter))
    : await crossEvent("conciliação diária: pedidos recentes de todos os eventos", () =>
        deps.db.select().from(giftOrders).where(filter).execute(),
      );
  const result: ReconcileResult = { checked: 0, changed: [], errors: 0 };
  const byAccount = new Map<number, PaymentProvider>();
  for (const order of rows) {
    const orderEv = ev ?? (await eventOfOrder(deps, order));
    let charge: ChargeSnapshot;
    try {
      let provider = deps.provider;
      if (order.paymentAccountId !== null) {
        provider =
          byAccount.get(order.paymentAccountId) ?? (await orderProvider(orderEv, deps, order));
        byAccount.set(order.paymentAccountId, provider);
      }
      charge = await provider.getCharge(order.providerOrderId!);
    } catch (err) {
      // 404: cobrança que o provedor não conhece mais (no simulado, a API reiniciou).
      if (!(err instanceof PaymentProviderError && err.status === 404)) {
        result.errors++;
        console.warn(`[conciliação] Falha ao consultar o pedido ${order.publicId}.`);
      }
      continue;
    }
    result.checked++;
    const { changedTo } = await applyCharge(orderEv, deps, charge);
    if (changedTo)
      result.changed.push({ publicId: order.publicId, from: order.status, to: changedTo });
  }
  return result;
}

export type RefundOutcome =
  { ok: true; order: OrderRow | null } | { ok: false; status: 404 | 409 | 502; message: string };

/**
 * Reembolso pelo painel: pede ao provedor e aplica o resultado (pedido `refunded`, cotas
 * devolvidas). O recado que veio com o presente sai do mural.
 */
export async function refundOrder(
  ev: EventCtx,
  deps: OrderDeps,
  publicId: string,
): Promise<RefundOutcome> {
  const [order] = await deps.db
    .select()
    .from(giftOrders)
    .where(and(eq(giftOrders.publicId, publicId), byEvent(giftOrders, ev)));
  if (!order) return { ok: false, status: 404, message: "Pedido não encontrado." };
  if (order.status !== "paid" || !order.providerOrderId) {
    return {
      ok: false,
      status: 409,
      message: "Só pedidos pagos podem ser reembolsados.",
    };
  }
  let charge: ChargeSnapshot;
  try {
    // Reembolso na conta em que o presente foi pago (o dinheiro está lá).
    const provider = await orderProvider(ev, deps, order);
    charge = await provider.refund(order.providerOrderId);
  } catch (err) {
    if (
      deps.provider.name === "simulado" &&
      err instanceof PaymentProviderError &&
      err.status === 404
    ) {
      // Simulado: a cobrança ficou só na memória de uma execução anterior da API.
      charge = simulatedRefund(order);
    } else {
      console.error(`[pedidos] Reembolso do pedido ${publicId} falhou no provedor.`, err);
      return {
        ok: false,
        status: 502,
        message:
          "O provedor de pagamento não confirmou o reembolso. Tente de novo em alguns minutos ou faça pelo painel do provedor.",
      };
    }
  }
  if (charge.status !== "refunded") {
    return {
      ok: false,
      status: 502,
      message: `O provedor respondeu "${charge.statusDetail ?? charge.status}" em vez de reembolsado. Confira no painel do provedor.`,
    };
  }
  await applyCharge(ev, deps, { ...charge, externalReference: order.publicId });
  await deps.db
    .update(messages)
    .set({ approved: false })
    .where(and(eq(messages.giftOrderId, order.id), byEvent(messages, ev)));
  const [fresh] = await deps.db
    .select()
    .from(giftOrders)
    .where(and(eq(giftOrders.id, order.id), byEvent(giftOrders, ev)));
  return { ok: true, order: fresh ?? null };
}

function simulatedRefund(order: OrderRow): ChargeSnapshot {
  return {
    providerOrderId: order.providerOrderId!,
    externalReference: order.publicId,
    status: "refunded",
    statusDetail: "refunded",
    method: order.method,
    paymentId: null,
    amountCents: order.amountCents + order.feeCents,
    pix: null,
    raw: { simulado: true },
  };
}
