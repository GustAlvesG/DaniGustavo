"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import {
  CardCheckoutRequest,
  CardCheckoutResponse,
  CreateOrderRequest,
  ERROR_CODES,
  OrderView,
  PayWithCardRequest,
  PayWithCardResponse,
  type OrderView as Order,
  type PayWithCardRequest as CardBody,
} from "@casamento/shared";
import { apiWrite, clientIpFrom } from "@/lib/api/client";
import { CACHE_TAGS } from "@/lib/api/tags";
import { parseReais } from "@/lib/presentes";

/* ------------------------------------------------------------------------ */
/* Criar o pedido (formulário do presente em /presentes)                     */
/* ------------------------------------------------------------------------ */

export type OrderFormState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      /** Campo que causou o erro, para marcar no formulário. */
      field?: "amount" | "quantity" | "buyerName" | "buyerEmail" | "buyerCpf" | "message";
      /** Presente esgotado: o formulário oferece voltar à lista. */
      soldOut?: boolean;
    };

const FIELD_BY_PATH: Record<
  string,
  NonNullable<Extract<OrderFormState, { field?: unknown }>["field"]>
> = {
  amountCents: "amount",
  quantity: "quantity",
  buyerName: "buyerName",
  buyerEmail: "buyerEmail",
  buyerCpf: "buyerCpf",
  message: "message",
};

/**
 * Server Action do formulário "Presentear" (`useActionState` + `<form action>`).
 * Valida de novo no servidor, cria o pedido na API e, deu certo, invalida o
 * cache da lista (as cotas mudaram) e manda para a tela de pagamento. É o
 * equivalente a um POST de formulário com `return redirect()` no Laravel.
 */
export async function createOrderAction(
  _prev: OrderFormState,
  form: FormData,
): Promise<OrderFormState> {
  const text = (k: string) => String(form.get(k) ?? "");
  const valor = text("valor");
  const body = {
    giftSlug: text("giftSlug"),
    quantity: Number(text("quantity") || "1"),
    amountCents: valor ? (parseReais(valor) ?? -1) : undefined,
    buyerName: text("buyerName"),
    buyerEmail: text("buyerEmail").trim(),
    // Só existe no formulário quando o provedor exige (Asaas); vai direto para a API.
    buyerCpf: text("buyerCpf") || undefined,
    message: text("message"),
    showOnWall: form.get("showOnWall") === "on",
    method: "pix" as const,
    website: text("website"),
  };
  if (body.amountCents === -1) {
    return {
      status: "error",
      field: "amount",
      message: "Valor inválido. Use só números, como 150,00.",
    };
  }

  const parsed = CreateOrderRequest.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: "error",
      field: FIELD_BY_PATH[String(issue?.path[0])],
      message: issue?.message ?? "Algum dado não confere. Revise e tente de novo.",
    };
  }

  const result = await apiWrite("POST", "/api/orders", parsed.data, {
    clientIp: clientIpFrom(await headers()),
    schema: OrderView,
  });
  if (!result.ok) {
    const { error, status } = result;
    if (error.code === ERROR_CODES.giftUnavailable) {
      updateTag(CACHE_TAGS.gifts);
      return { status: "error", message: error.message, soldOut: true };
    }
    if (status === 422) {
      const field = /CPF/.test(error.message) ? ("buyerCpf" as const) : undefined;
      return { status: "error", message: error.message, field };
    }
    if (error.code === "unavailable") {
      return {
        status: "error",
        message: "Não conseguimos falar com o servidor. Tente de novo em alguns instantes.",
      };
    }
    return { status: "error", message: error.message };
  }

  updateTag(CACHE_TAGS.gifts);
  redirect(`/presentes/pagamento/${result.data.publicId}`);
}

/* ------------------------------------------------------------------------ */
/* Cartão (tela de pagamento)                                                */
/* ------------------------------------------------------------------------ */

export type CardActionResult =
  | { ok: true; outcome: "approved" | "rejected" | "pending"; message: string; order: Order }
  | { ok: false; message: string; expired?: boolean };

/**
 * Cartão na página segura do provedor (Asaas): pede à API o link da fatura e o navegador
 * vai para lá. Os dados do cartão nunca passam pelo site nem pela API.
 */
export async function startCardCheckoutAction(
  publicId: string,
  body: CardCheckoutRequest,
): Promise<{ ok: true; url: string } | { ok: false; message: string; expired?: boolean }> {
  const parsed = CardCheckoutRequest.safeParse(body);
  if (!parsed.success) return { ok: false, message: "Dados inválidos. Recarregue a página." };
  const result = await apiWrite(
    "POST",
    `/api/orders/${encodeURIComponent(publicId)}/card-checkout`,
    parsed.data,
    { clientIp: clientIpFrom(await headers()), schema: CardCheckoutResponse },
  );
  if (!result.ok) {
    return {
      ok: false,
      message: result.error.message,
      expired: result.error.code === ERROR_CODES.orderNotPending,
    };
  }
  return { ok: true, url: result.data.url };
}

/** Modo simulado: paga com o "token" do formulário de teste (o número nunca passa aqui). */
export async function payWithCardAction(
  publicId: string,
  card: CardBody,
): Promise<CardActionResult> {
  const parsed = PayWithCardRequest.safeParse(card);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados do cartão inválidos." };
  }
  const result = await apiWrite(
    "POST",
    `/api/orders/${encodeURIComponent(publicId)}/card`,
    parsed.data,
    { clientIp: clientIpFrom(await headers()), schema: PayWithCardResponse },
  );
  if (!result.ok) {
    return {
      ok: false,
      message: result.error.message,
      expired: result.error.code === ERROR_CODES.orderNotPending,
    };
  }
  if (result.data.outcome === "approved") updateTag(CACHE_TAGS.gifts);
  return { ok: true, ...result.data };
}

/* ------------------------------------------------------------------------ */
/* Modo simulado                                                             */
/* ------------------------------------------------------------------------ */

/**
 * "Simular pagamento aprovado": pede à API (só existe no modo simulado e fora
 * de produção) que marque o Pix como pago e entregue o webhook assinado.
 */
export async function simulateApprovalAction(
  publicId: string,
): Promise<{ ok: boolean; message?: string }> {
  const result = await apiWrite(
    "POST",
    `/api/dev/orders/${encodeURIComponent(publicId)}/approve`,
    undefined,
  );
  if (!result.ok) return { ok: false, message: result.error.message };
  return { ok: true };
}
