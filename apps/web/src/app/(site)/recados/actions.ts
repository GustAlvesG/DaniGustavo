"use server";

import { headers } from "next/headers";
import { CreateMessageRequest, ERROR_CODES } from "@casamento/shared";
import { apiWrite, clientIpFrom } from "@/lib/api/client";

export type MessageValues = { author: string; body: string };

export type MessageState =
  | { status: "idle" }
  | { status: "sent" }
  | {
      status: "error";
      message: string;
      /** Campo que causou o erro, para marcar no formulário. */
      field?: "author" | "body";
      values: MessageValues;
    };

const text = (data: FormData, key: string) => {
  const v = data.get(key);
  return typeof v === "string" ? v : "";
};

/**
 * Server Action de "Deixe um recado" (sem presente). Valida com o schema do contrato e
 * manda para a API, que grava como pendente: o recado só aparece no mural depois que os
 * noivos aprovam no painel. O IP vai para o limite da API e não é guardado.
 */
export async function sendMessageAction(
  _prev: MessageState,
  data: FormData,
): Promise<MessageState> {
  const values: MessageValues = { author: text(data, "author"), body: text(data, "body") };
  const parsed = CreateMessageRequest.safeParse({ ...values, website: text(data, "website") });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const key = String(issue?.path[0]);
    return {
      status: "error",
      field: key === "author" || key === "body" ? key : undefined,
      message: issue?.message ?? "Confira os campos e tente de novo.",
      values,
    };
  }

  const result = await apiWrite("POST", "/api/messages", parsed.data, {
    clientIp: clientIpFrom(await headers()),
  });
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.error.code === "unavailable"
          ? "Não conseguimos enviar agora. Tente de novo em alguns instantes."
          : result.error.code === ERROR_CODES.tooManyRequests
            ? result.error.message
            : "Não foi possível enviar o recado. Confira os campos e tente de novo.",
      values,
    };
  }
  return { status: "sent" };
}
