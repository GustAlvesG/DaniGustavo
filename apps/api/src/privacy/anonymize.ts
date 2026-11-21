import {
  and,
  byEvent,
  eq,
  giftOrders,
  guests,
  inArray,
  invitations,
  isNull,
  messages,
  payments,
  rsvpLogs,
  type Database,
} from "@casamento/db";
import type { EventCtx } from "../tenancy/types.ts";

/*
 * Anonimização (Fase 6, LGPD): troca por marcadores os dados pessoais de convites (rótulo, nomes,
 * contatos, restrições alimentares, histórico do RSVP) e de pedidos (nome, e-mail e recado do
 * comprador). Valores, quantidades, status e datas ficam: são a contabilidade do recebedor e os
 * totais do painel não mudam. Usada no pedido de exclusão de um titular e na retenção.
 */

export const ANONYMIZED_INVITATION_LABEL = "Convite anonimizado";
export const ANONYMIZED_GUEST_NAME = "Convidado anonimizado";
export const ANONYMIZED_BUYER_NAME = "Comprador anonimizado";
/** O e-mail do comprador é obrigatório na tabela: um endereço que não existe (RFC 2606). */
export const ANONYMIZED_BUYER_EMAIL = "anonimizado@anonimizado.invalid";

/** Pedidos que não estão mais pendentes. */
const SETTLED = ["paid", "expired", "failed", "refunded"] as const;

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Anonimiza convites do evento (ids de outro evento são ignorados). Devolve quantos mudaram. */
export async function anonymizeInvitations(
  ev: EventCtx,
  tx: Tx | Database,
  ids: number[] | "all",
  now: Date,
): Promise<number> {
  if (ids !== "all" && ids.length === 0) return 0;
  const scope =
    ids === "all"
      ? byEvent(invitations, ev)
      : and(byEvent(invitations, ev), inArray(invitations.id, ids));
  const rows = await tx
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(scope, isNull(invitations.anonymizedAt)));
  const found = rows.map((r) => r.id);
  if (found.length === 0) return 0;
  await tx
    .update(guests)
    .set({
      name: ANONYMIZED_GUEST_NAME,
      phone: null,
      email: null,
      dietaryNotes: null,
      updatedAt: now,
    })
    .where(and(byEvent(guests, ev), inArray(guests.invitationId, found)));
  await tx
    .delete(rsvpLogs)
    .where(and(byEvent(rsvpLogs, ev), inArray(rsvpLogs.invitationId, found)));
  await tx
    .update(invitations)
    .set({
      label: ANONYMIZED_INVITATION_LABEL,
      contactEmail: null,
      contactPhone: null,
      anonymizedAt: now,
      updatedAt: now,
    })
    .where(and(byEvent(invitations, ev), inArray(invitations.id, found)));
  return found.length;
}

/**
 * Anonimiza pedidos do evento. Pedido pendente fica de fora (ainda pode ser pago e o provedor
 * conversa com ele); o recado que veio com o pedido sai do mural (é texto pessoal).
 */
export async function anonymizeOrders(
  ev: EventCtx,
  tx: Tx | Database,
  ids: number[] | "all",
  now: Date,
): Promise<number> {
  if (ids !== "all" && ids.length === 0) return 0;
  const scope =
    ids === "all"
      ? byEvent(giftOrders, ev)
      : and(byEvent(giftOrders, ev), inArray(giftOrders.id, ids));
  const rows = await tx
    .select({ id: giftOrders.id })
    .from(giftOrders)
    .where(and(scope, isNull(giftOrders.anonymizedAt), inArray(giftOrders.status, SETTLED)));
  const found = rows.map((r) => r.id);
  if (found.length === 0) return 0;
  await tx.delete(messages).where(and(byEvent(messages, ev), inArray(messages.giftOrderId, found)));
  // O payload bruto do provedor pode trazer dados do pagador.
  await tx
    .update(payments)
    .set({ raw: null, updatedAt: now })
    .where(and(byEvent(payments, ev), inArray(payments.orderId, found)));
  await tx
    .update(giftOrders)
    .set({
      buyerName: ANONYMIZED_BUYER_NAME,
      buyerEmail: ANONYMIZED_BUYER_EMAIL,
      message: null,
      showOnWall: false,
      pixCode: null,
      pixQrBase64: null,
      pixTicketUrl: null,
      anonymizedAt: now,
      updatedAt: now,
    })
    .where(and(byEvent(giftOrders, ev), inArray(giftOrders.id, found)));
  return found.length;
}

/** Recados ainda não aprovados (nunca foram públicos) saem na retenção. */
export async function deleteUnapprovedMessages(ev: EventCtx, tx: Tx | Database): Promise<number> {
  const [res] = await tx
    .delete(messages)
    .where(and(byEvent(messages, ev), eq(messages.approved, false)));
  return res.affectedRows;
}
