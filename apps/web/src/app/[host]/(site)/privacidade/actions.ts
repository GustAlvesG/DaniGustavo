"use server";

import { headers } from "next/headers";
import { ERROR_CODES, PrivacyRequestInput } from "@casamento/shared";
import { apiWrite, clientIpFrom } from "@/lib/api/client";
import { eventPath, requestEvent } from "@/lib/api/event";

export type PrivacyRequestValues = { kind: string; name: string; email: string; message: string };

export type PrivacyRequestState =
  | { status: "idle" }
  | { status: "sent" }
  | {
      status: "error";
      message: string;
      /** Campo que causou o erro, para marcar no formulário. */
      field?: "kind" | "name" | "email" | "message";
      values: PrivacyRequestValues;
    };

const text = (data: FormData, key: string) => {
  const v = data.get(key);
  return typeof v === "string" ? v : "";
};

const FIELDS = new Set(["kind", "name", "email", "message"]);

/**
 * Server Action do pedido do titular (LGPD) em /privacidade: valida com o contrato e manda para a
 * API, que grava o pedido e avisa a equipe do evento. O IP só vai para o limite da API.
 */
export async function sendPrivacyRequest(
  _prev: PrivacyRequestState,
  data: FormData,
): Promise<PrivacyRequestState> {
  const values: PrivacyRequestValues = {
    kind: text(data, "kind"),
    name: text(data, "name"),
    email: text(data, "email"),
    message: text(data, "message"),
  };
  const parsed = PrivacyRequestInput.safeParse({ ...values, website: text(data, "website") });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const key = String(issue?.path[0]);
    return {
      status: "error",
      field: FIELDS.has(key) ? (key as "kind" | "name" | "email" | "message") : undefined,
      message: issue?.message ?? "Confira os campos e tente de novo.",
      values,
    };
  }

  // Server Action não tem root params: o evento sai do header que o proxy gravou.
  const ev = await requestEvent();
  if (!ev) {
    return {
      status: "error",
      message: "Não encontramos o evento deste site. Recarregue a página.",
      values,
    };
  }
  const result = await apiWrite("POST", eventPath(ev, "/privacy-requests"), parsed.data, {
    clientIp: clientIpFrom(await headers()),
  });
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.error.code === "unavailable"
          ? "Não conseguimos enviar agora. Tente de novo em alguns instantes."
          : result.error.code === ERROR_CODES.tooManyRequests || result.status === 422
            ? result.error.message
            : "Não foi possível enviar o pedido. Confira os campos e tente de novo.",
      values,
    };
  }
  return { status: "sent" };
}
