import {
  and,
  asc,
  eq,
  giftOrders,
  gifts,
  lt,
  messages,
  newPublicId,
  payments,
  settings,
  sql,
  type Database,
} from "@casamento/db";
import {
  cardFeeCents,
  CardPayment,
  CreateOrderRequest,
  ERROR_CODES,
  ORDER_HOLD_MINUTES,
  OrderView,
  type GiftCategory,
  type GiftsResponse,
  type OrderStatus,
} from "@casamento/shared";
import type { z } from "zod";
import type { Env } from "../env.ts";
import type { Mailer } from "../mailer.ts";
import {
  PaymentProviderError,
  type ChargeSnapshot,
  type PaymentProvider,
} from "../payments/index.ts";
import { notifyPaid, type Notifier } from "./notify.ts";

/*
 * Regras dos pedidos de presente. As rotas só traduzem HTTP ↔ estas funções.
 *
 * Reserva de cotas: `gifts.quota_sold` conta cotas vendidas **e** reservadas por pedidos
 * pendentes. Criar o pedido soma (com `SELECT … FOR UPDATE` no presente, dentro de uma
 * transação: duas compras da última cota nunca passam juntas); expirar, falhar ou
 * reembolsar devolve. Presentes de valor livre não têm limite de cotas.
 */

export interface OrderDeps {
  env: Env;
  db: Database;
  provider: PaymentProvider;
  mailer: Mailer;
  notifier?: Notifier;
  now: () => Date;
}

export type OrderRow = typeof giftOrders.$inferSelect;
export type GiftRow = typeof gifts.$inferSelect;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type Failure = {
  ok: false;
  status: 404 | 409 | 422 | 502;
  code: string;
  message: string;
};
export type Result<T> = ({ ok: true } & T) | Failure;

const fail = (status: Failure["status"], code: string, message: string): Failure => ({
  ok: false,
  status,
  code,
  message,
});

async function setting<T>(db: Database, key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row ? (row.value as T) : fallback;
}

export const cardFeePercent = (db: Database) =>
  setting<number>(db, "payments.card_fee_percent", 0).then((v) => Number(v) || 0);

/* ------------------------------------------------------------------------ */
/* Lista de presentes                                                        */
/* ------------------------------------------------------------------------ */

export async function listGifts(db: Database): Promise<Omit<GiftsResponse, "requiresCpf">> {
  const [rows, categories, feePercent] = await Promise.all([
    db.select().from(gifts).where(eq(gifts.active, true)).orderBy(asc(gifts.sort), asc(gifts.id)),
    setting<GiftCategory[]>(db, "gifts.categories", []),
    cardFeePercent(db),
  ]);
  return {
    gifts: rows.map((g) => ({
      slug: g.slug,
      title: g.title,
      description: g.description,
      image: g.image,
      priceCents: g.priceCents,
      openAmount: g.openAmount,
      quotaTotal: g.quotaTotal,
      quotaLeft: g.openAmount ? g.quotaTotal : Math.max(0, g.quotaTotal - g.quotaSold),
      category: g.category,
    })),
    categories,
    cardFeePercent: feePercent,
  };
}

/* ------------------------------------------------------------------------ */
/* Visão pública do pedido                                                   */
/* ------------------------------------------------------------------------ */

export async function loadOrder(db: Database, publicId: string) {
  const [row] = await db
    .select({ order: giftOrders, gift: gifts })
    .from(giftOrders)
    .innerJoin(gifts, eq(gifts.id, giftOrders.giftId))
    .where(eq(giftOrders.publicId, publicId));
  return row ?? null;
}

export async function orderView(
  deps: Pick<OrderDeps, "db" | "provider">,
  order: OrderRow,
  gift: GiftRow,
): Promise<OrderView> {
  const pixActive = order.status === "pending" && order.method === "pix" && order.pixCode;
  return OrderView.parse({
    publicId: order.publicId,
    status: order.status,
    statusDetail: order.statusDetail,
    method: order.method,
    provider: order.provider,
    gift: { slug: gift.slug, title: gift.title, openAmount: gift.openAmount },
    quantity: order.quantity,
    amountCents: order.amountCents,
    feeCents: order.feeCents,
    totalCents: order.amountCents + order.feeCents,
    buyerName: order.buyerName,
    message: order.message,
    expiresAt: order.expiresAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    pix: pixActive
      ? {
          code: order.pixCode,
          qrImageBase64: order.pixQrBase64,
          ticketUrl: order.pixTicketUrl,
        }
      : null,
    card: {
      publicKey: deps.provider.publicKey,
      feePercent: await cardFeePercent(deps.db),
      checkout: deps.provider.createCardCheckout ? "hosted" : "form",
    },
  });
}

/* ------------------------------------------------------------------------ */
/* Criação                                                                   */
/* ------------------------------------------------------------------------ */

type ParsedCreate = z.output<typeof CreateOrderRequest>;

async function releaseQuota(tx: Tx, order: OrderRow) {
  await tx
    .update(gifts)
    .set({ quotaSold: sql`GREATEST(${gifts.quotaSold} - ${order.quantity}, 0)` })
    .where(and(eq(gifts.id, order.giftId), eq(gifts.openAmount, false)));
}

/** Cria o pedido reservando as cotas e, no Pix, já gera a cobrança. */
export async function createOrder(
  deps: OrderDeps,
  req: ParsedCreate,
): Promise<Result<{ order: OrderView; outcome?: CardOutcome }>> {
  const { db, provider, now } = deps;
  const [gift] = await db
    .select()
    .from(gifts)
    .where(and(eq(gifts.slug, req.giftSlug), eq(gifts.active, true)));
  if (!gift) {
    return fail(
      404,
      ERROR_CODES.notFound,
      "Presente não encontrado. Volte à lista e escolha de novo.",
    );
  }
  if (req.method === "card" && !req.card) {
    return fail(422, ERROR_CODES.invalidRequest, "Envie os dados do cartão para pagar com cartão.");
  }
  if (provider.requiresCpf && !req.buyerCpf) {
    return fail(
      422,
      ERROR_CODES.invalidRequest,
      "Informe o seu CPF: o processador de pagamento exige o documento de quem paga.",
    );
  }

  let quantity = req.quantity;
  let amountCents: number;
  if (gift.openAmount) {
    if (req.amountCents === undefined) {
      return fail(422, ERROR_CODES.invalidRequest, "Informe o valor da contribuição.");
    }
    quantity = 1;
    amountCents = req.amountCents;
  } else {
    amountCents = gift.priceCents * quantity;
  }

  const publicId = newPublicId();
  const created = now();
  const expiresAt = new Date(created.getTime() + ORDER_HOLD_MINUTES * 60_000);

  const reserved = await db.transaction(async (tx) => {
    // Trava a linha do presente até o fim da transação: a próxima compra espera aqui.
    const [locked] = await tx.select().from(gifts).where(eq(gifts.id, gift.id)).for("update");
    if (!locked) return false;
    if (!locked.openAmount) {
      if (locked.quotaTotal - locked.quotaSold < quantity) return false;
      await tx
        .update(gifts)
        .set({ quotaSold: sql`${gifts.quotaSold} + ${quantity}` })
        .where(eq(gifts.id, gift.id));
    }
    await tx.insert(giftOrders).values({
      publicId,
      giftId: gift.id,
      quantity,
      amountCents,
      buyerName: req.buyerName,
      buyerEmail: req.buyerEmail.toLowerCase(),
      message: req.message ?? null,
      showOnWall: req.showOnWall,
      status: "pending",
      method: "pix",
      provider: provider.name,
      expiresAt,
      createdAt: created,
      updatedAt: created,
    });
    return true;
  });

  if (!reserved) {
    const [fresh] = await db.select().from(gifts).where(eq(gifts.id, gift.id));
    const left = fresh ? Math.max(0, fresh.quotaTotal - fresh.quotaSold) : 0;
    return fail(
      409,
      ERROR_CODES.giftUnavailable,
      left === 0
        ? "Este presente acabou de ser escolhido por outra pessoa. Escolha outro item da lista."
        : `Restam só ${left} ${left === 1 ? "cota" : "cotas"} deste presente. Diminua a quantidade e tente de novo.`,
    );
  }

  if (req.method === "card" && req.card) {
    return payWithCard(deps, publicId, req.card);
  }

  const loaded = await loadOrder(db, publicId);
  if (!loaded) throw new Error(`Pedido ${publicId} sumiu logo depois de criado.`);

  try {
    const charge = await provider.createPix({
      publicId,
      amountCents,
      description: `Presente: ${gift.title}`,
      payerEmail: loaded.order.buyerEmail,
      payerName: loaded.order.buyerName,
      // Só repassado ao provedor: o CPF não é gravado no pedido.
      payerCpf: req.buyerCpf,
      expiresInMinutes: ORDER_HOLD_MINUTES,
    });
    await db
      .update(giftOrders)
      .set({
        providerOrderId: charge.providerOrderId,
        statusDetail: charge.statusDetail,
        pixCode: charge.pix?.code ?? null,
        pixQrBase64: charge.pix?.qrImageBase64 ?? null,
        pixTicketUrl: charge.pix?.ticketUrl ?? null,
      })
      .where(eq(giftOrders.id, loaded.order.id));
  } catch (err) {
    console.error(`[pedidos] Falha ao gerar o Pix do pedido ${publicId}:`, describeError(err));
    await db.transaction(async (tx) => {
      const [o] = await tx
        .select()
        .from(giftOrders)
        .where(eq(giftOrders.id, loaded.order.id))
        .for("update");
      if (o?.status !== "pending") return;
      await tx
        .update(giftOrders)
        .set({ status: "failed", statusDetail: "pix_creation_failed" })
        .where(eq(giftOrders.id, o.id));
      await releaseQuota(tx, o);
    });
    return fail(
      502,
      ERROR_CODES.paymentFailed,
      "Não conseguimos gerar o Pix agora. Tente de novo em alguns minutos.",
    );
  }

  const fresh = await loadOrder(db, publicId);
  return { ok: true, order: await orderView(deps, fresh!.order, fresh!.gift) };
}

/* ------------------------------------------------------------------------ */
/* Cartão                                                                    */
/* ------------------------------------------------------------------------ */

export type CardOutcome = "approved" | "rejected" | "pending";

/** Mensagens de recusa do cartão: o que houve e o que fazer. */
export function rejectionMessage(detail: string | null): string {
  switch (detail) {
    case "cc_rejected_insufficient_amount":
      return "O cartão foi recusado por limite insuficiente. Tente outro cartão ou pague com Pix.";
    case "cc_rejected_bad_filled_security_code":
      return "O código de segurança não confere. Confira o CVV no verso do cartão e tente de novo.";
    case "cc_rejected_bad_filled_date":
      return "A validade não confere. Confira o mês e o ano e tente de novo.";
    case "cc_rejected_bad_filled_other":
    case "cc_rejected_bad_filled_card_number":
      return "Algum dado do cartão não confere. Revise e tente de novo.";
    case "cc_rejected_call_for_authorize":
      return "O banco pediu para você autorizar a compra. Ligue para o banco e tente de novo, ou pague com Pix.";
    default:
      return "O cartão foi recusado pelo banco. Tente outro cartão ou pague com Pix.";
  }
}

export async function payWithCard(
  deps: OrderDeps,
  publicId: string,
  card: z.output<typeof CardPayment>,
): Promise<Result<{ order: OrderView; outcome: CardOutcome; message: string }>> {
  const { db, provider, now } = deps;
  const loaded = await loadOrder(db, publicId);
  if (!loaded) return fail(404, ERROR_CODES.notFound, "Pedido não encontrado.");
  let { order } = loaded;
  const { gift } = loaded;

  if (order.status === "pending" && now() > order.expiresAt) {
    await expireOrder(deps, order);
    order = (await loadOrder(db, publicId))!.order;
  }
  if (order.status !== "pending") {
    return fail(
      409,
      ERROR_CODES.orderNotPending,
      order.status === "paid"
        ? "Este presente já foi pago. Obrigado!"
        : "Este pedido expirou. Volte à lista de presentes e escolha de novo.",
    );
  }

  const feePercent = await cardFeePercent(db);
  const feeCents = card.coverFee ? cardFeeCents(order.amountCents, feePercent) : 0;

  let charge: ChargeSnapshot;
  try {
    charge = await provider.createCard({
      publicId,
      amountCents: order.amountCents + feeCents,
      description: `Presente: ${gift.title}`,
      payerEmail: order.buyerEmail,
      token: card.token,
      paymentMethodId: card.paymentMethodId,
      paymentType: card.paymentType,
      installments: card.installments,
    });
  } catch (err) {
    console.error(`[pedidos] Falha no cartão do pedido ${publicId}:`, describeError(err));
    return fail(
      502,
      ERROR_CODES.paymentFailed,
      "Não conseguimos falar com o processador do cartão. Tente de novo em alguns minutos ou pague com Pix.",
    );
  }

  if (charge.status === "approved" || charge.status === "pending") {
    // A taxa só vale para o cartão: grava antes de aplicar o status.
    await db
      .update(giftOrders)
      .set({ feeCents, feeCovered: card.coverFee })
      .where(eq(giftOrders.id, order.id));
  }

  let outcome: CardOutcome;
  let message: string;
  if (charge.status === "approved") {
    await applyCharge(deps, charge);
    outcome = "approved";
    message = "Presente enviado.";
  } else if (charge.status === "pending") {
    outcome = "pending";
    message = "O pagamento está em análise. Avisamos por e-mail assim que for aprovado.";
  } else {
    outcome = "rejected";
    message = rejectionMessage(charge.statusDetail);
  }

  const fresh = await loadOrder(db, publicId);
  return { ok: true, outcome, message, order: await orderView(deps, fresh!.order, fresh!.gift) };
}

/**
 * Cartão na página hospedada do provedor (Asaas): cria (ou reaproveita) a cobrança de cartão
 * do pedido e devolve o link. A taxa escolhida fica no pedido; se no fim a pessoa pagar
 * com Pix, `applyCharge` zera a taxa.
 */
export async function startCardCheckout(
  deps: OrderDeps,
  publicId: string,
  coverFee: boolean,
): Promise<Result<{ url: string }>> {
  const { db, provider, now, env } = deps;
  if (!provider.createCardCheckout) {
    return fail(422, ERROR_CODES.invalidRequest, "Este pagamento usa o formulário de cartão.");
  }
  const loaded = await loadOrder(db, publicId);
  if (!loaded) return fail(404, ERROR_CODES.notFound, "Pedido não encontrado.");
  let { order } = loaded;
  if (order.status === "pending" && now() > order.expiresAt) {
    await expireOrder(deps, order);
    order = (await loadOrder(db, publicId))!.order;
  }
  if (order.status !== "pending") {
    return fail(
      409,
      ERROR_CODES.orderNotPending,
      order.status === "paid"
        ? "Este presente já foi pago. Obrigado!"
        : "Este pedido expirou. Volte à lista de presentes e escolha de novo.",
    );
  }
  const feeCents = coverFee ? cardFeeCents(order.amountCents, await cardFeePercent(db)) : 0;
  try {
    const charge = await provider.createCardCheckout({
      publicId,
      amountCents: order.amountCents + feeCents,
      description: `Presente: ${loaded.gift.title}`,
      baseChargeId: order.providerOrderId,
      successUrl: hostedReturnUrl(env.SITE_URL, publicId),
    });
    await db
      .update(giftOrders)
      .set({ feeCents, feeCovered: coverFee })
      .where(and(eq(giftOrders.id, order.id), eq(giftOrders.status, "pending")));
    return { ok: true, url: charge.checkoutUrl };
  } catch (err) {
    console.error(`[pedidos] Falha ao abrir o cartão do pedido ${publicId}:`, describeError(err));
    return fail(
      502,
      ERROR_CODES.paymentFailed,
      "Não conseguimos abrir o pagamento com cartão agora. Tente de novo em alguns minutos ou pague com Pix.",
    );
  }
}

/**
 * Para onde o provedor devolve a pessoa depois de pagar o cartão. O Asaas só aceita o
 * domínio cadastrado na conta, então em localhost não mandamos (a pessoa volta pela fatura).
 */
export function hostedReturnUrl(siteUrl: string, publicId: string): string | null {
  const url = new URL(`/presentes/obrigado/${publicId}`, siteUrl);
  if (url.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(url.hostname)) return null;
  return url.toString();
}

/** Erro para o log sem dados de quem paga (o corpo de erro do provedor fica resumido). */
function describeError(err: unknown) {
  if (err instanceof PaymentProviderError) {
    return { message: err.message, status: err.status, details: err.details };
  }
  return err;
}

/* ------------------------------------------------------------------------ */
/* Aplicar o status do provedor (webhook, cartão, conciliação)               */
/* ------------------------------------------------------------------------ */

/**
 * Leva o pedido ao estado que o provedor informou. Idempotente: aplicar a mesma
 * cobrança duas vezes não muda nada. É o único lugar que marca um pedido como pago.
 */
export async function applyCharge(
  deps: OrderDeps,
  charge: ChargeSnapshot,
): Promise<{ order: OrderRow | null; changedTo: OrderStatus | null }> {
  const { db, now } = deps;
  const where = charge.externalReference
    ? eq(giftOrders.publicId, charge.externalReference)
    : eq(giftOrders.providerOrderId, charge.providerOrderId);

  const result = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(giftOrders).where(where).for("update");
    if (!order) return { order: null, changedTo: null, previousCharge: null };
    const isActiveCharge = order.providerOrderId === charge.providerOrderId;
    let changedTo: OrderStatus | null = null;

    if (charge.status === "approved") {
      if (order.status !== "paid" && order.status !== "refunded") {
        if (order.status !== "pending") {
          // Pago depois de expirar (Pix no último segundo): reserva as cotas de novo.
          const [g] = await tx.select().from(gifts).where(eq(gifts.id, order.giftId)).for("update");
          if (g && !g.openAmount) {
            if (g.quotaTotal - g.quotaSold < order.quantity) {
              console.warn(
                `[pedidos] Pedido ${order.publicId} pago depois de expirar e sem cotas livres: a cota fica acima do total.`,
              );
            }
            await tx
              .update(gifts)
              .set({ quotaSold: sql`${gifts.quotaSold} + ${order.quantity}` })
              .where(eq(gifts.id, g.id));
          }
        }
        await tx
          .update(giftOrders)
          .set({
            status: "paid",
            paidAt: now(),
            method: charge.method,
            // A taxa é só do cartão: escolheu no cartão e pagou no Pix, não há taxa.
            ...(charge.method === "pix" ? { feeCents: 0, feeCovered: false } : {}),
            providerOrderId: charge.providerOrderId,
            statusDetail: charge.statusDetail,
            pixCode: null,
            pixQrBase64: null,
            pixTicketUrl: null,
          })
          .where(eq(giftOrders.id, order.id));
        const gross =
          charge.amountCents || order.amountCents + (charge.method === "pix" ? 0 : order.feeCents);
        await tx
          .insert(payments)
          .ignore()
          .values({
            orderId: order.id,
            gateway: order.provider,
            gatewayId: charge.paymentId ?? charge.providerOrderId,
            method: charge.method,
            gatewayStatus: charge.statusDetail,
            grossCents: gross,
            feeCents: 0,
            netCents: gross,
            raw: charge.raw,
          });
        if (order.message && order.showOnWall) {
          await tx
            .insert(messages)
            .ignore()
            .values({ author: order.buyerName, body: order.message, giftOrderId: order.id });
        }
        changedTo = "paid";
      }
    } else if (charge.status === "refunded") {
      if (order.status === "paid") {
        await tx
          .update(giftOrders)
          .set({ status: "refunded", statusDetail: charge.statusDetail })
          .where(eq(giftOrders.id, order.id));
        await releaseQuota(tx, order);
        changedTo = "refunded";
      }
    } else if (charge.status === "pending") {
      if (order.status === "pending" && isActiveCharge) {
        await tx
          .update(giftOrders)
          .set({ statusDetail: charge.statusDetail })
          .where(eq(giftOrders.id, order.id));
      }
    } else if (order.status === "pending" && isActiveCharge) {
      // Pix vencido/cancelado no provedor. Cartão recusado não mexe no pedido: dá para
      // tentar outro cartão ou o Pix, que continua valendo.
      const status: OrderStatus = charge.status === "rejected" ? "failed" : "expired";
      await tx
        .update(giftOrders)
        .set({ status, statusDetail: charge.statusDetail })
        .where(eq(giftOrders.id, order.id));
      await releaseQuota(tx, order);
      changedTo = status;
    }

    const previousCharge =
      changedTo === "paid" && order.providerOrderId && !isActiveCharge
        ? order.providerOrderId
        : null;
    return { order, changedTo, previousCharge };
  });

  if (result.changedTo === "paid" && result.order && deps.provider.listCharges) {
    // Pago por um caminho: apaga as outras cobranças abertas do pedido (o Pix, ou a fatura
    // do cartão), para ninguém pagar duas vezes.
    const others = await deps.provider
      .listCharges(result.order.publicId)
      .catch(() => [] as ChargeSnapshot[]);
    for (const other of others) {
      if (other.providerOrderId === charge.providerOrderId || other.status !== "pending") continue;
      await deps.provider.cancel(other.providerOrderId).catch((err: unknown) => {
        console.warn(
          `[pedidos] Não deu para cancelar a cobrança ${other.providerOrderId}:`,
          describeError(err),
        );
      });
    }
  } else if (result.previousCharge) {
    // Pagou com cartão: cancela o Pix que ainda estava aberto.
    await deps.provider.cancel(result.previousCharge).catch((err: unknown) => {
      console.warn(`[pedidos] Não deu para cancelar o Pix ${result.previousCharge}:`, err);
    });
  }

  if (result.changedTo === "paid" && result.order) {
    const loaded = await loadOrder(db, result.order.publicId);
    if (loaded) {
      // Sem await: e-mail e Telegram não seguram a resposta (falha vai para o log).
      void notifyPaid(deps, loaded.order, loaded.gift).catch((err: unknown) => {
        console.error("[pedidos] Falha ao avisar sobre o presente:", err);
      });
    }
  }
  return { order: result.order, changedTo: result.changedTo };
}

/* ------------------------------------------------------------------------ */
/* Expiração                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Confere no provedor todas as cobranças do pedido (Pix e cartão hospedado). Se alguma foi
 * paga, aplica e devolve `paid: true`; senão devolve as pendentes. Só para provedores com
 * `listCharges` (Asaas); null nos outros.
 */
export async function checkOrderCharges(
  deps: OrderDeps,
  publicId: string,
): Promise<{ paid: boolean; pending: string[] } | null> {
  if (!deps.provider.listCharges) return null;
  const charges = await deps.provider.listCharges(publicId);
  const approved = charges.find((c) => c.status === "approved");
  if (approved) {
    await applyCharge(deps, { ...approved, externalReference: publicId });
    return { paid: true, pending: [] };
  }
  return {
    paid: false,
    pending: charges.filter((c) => c.status === "pending").map((c) => c.providerOrderId),
  };
}

/** Expira um pedido pendente e devolve as cotas. Antes, confere se não foi pago. */
export async function expireOrder(deps: OrderDeps, order: OrderRow): Promise<OrderStatus> {
  if (deps.provider.listCharges) {
    let pending: string[];
    try {
      const checked = await checkOrderCharges(deps, order.publicId);
      if (checked?.paid) return "paid";
      pending = checked?.pending ?? [];
    } catch (err) {
      // Sem resposta do provedor: não expira às cegas; a próxima rodada tenta de novo.
      console.warn(
        `[pedidos] Não deu para consultar o pedido ${order.publicId}:`,
        describeError(err),
      );
      return "pending";
    }
    const status = await expireLocally(deps, order);
    // O QR do Asaas valeria por meses: apaga as cobranças abertas para ninguém pagar depois.
    for (const id of pending) {
      await deps.provider.cancel(id).catch((err: unknown) => {
        console.warn(`[pedidos] Não deu para cancelar a cobrança ${id}:`, describeError(err));
      });
    }
    return status;
  }
  if (order.providerOrderId) {
    try {
      const charge = await deps.provider.getCharge(order.providerOrderId);
      if (charge.status === "approved") {
        await applyCharge(deps, charge);
        return "paid";
      }
    } catch (err) {
      if (!(err instanceof PaymentProviderError && err.status === 404)) {
        console.warn(`[pedidos] Não deu para consultar ${order.providerOrderId}:`, err);
      }
    }
  }
  return expireLocally(deps, order);
}

function expireLocally(deps: OrderDeps, order: OrderRow): Promise<OrderStatus> {
  return deps.db.transaction(async (tx) => {
    const [o] = await tx.select().from(giftOrders).where(eq(giftOrders.id, order.id)).for("update");
    if (!o || o.status !== "pending") return o?.status ?? "expired";
    await tx
      .update(giftOrders)
      .set({
        status: "expired",
        statusDetail: "expired",
        pixCode: null,
        pixQrBase64: null,
        pixTicketUrl: null,
      })
      .where(eq(giftOrders.id, o.id));
    await releaseQuota(tx, o);
    return "expired";
  });
}

/** Expira todos os pendentes vencidos. Devolve quantos expiraram. */
export async function expirePendingOrders(deps: OrderDeps): Promise<number> {
  const due = await deps.db
    .select()
    .from(giftOrders)
    .where(and(eq(giftOrders.status, "pending"), lt(giftOrders.expiresAt, deps.now())));
  let expired = 0;
  for (const order of due) {
    if ((await expireOrder(deps, order)) === "expired") expired++;
  }
  return expired;
}
