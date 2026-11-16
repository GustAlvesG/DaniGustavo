"use server";

import { headers } from "next/headers";
import {
  ERROR_CODES,
  RsvpRequest,
  RsvpResponse,
  type Invitation,
  type RsvpRequest as RsvpBody,
} from "@casamento/shared";
import { apiWrite, clientIpFrom } from "@/lib/api/client";

export type RsvpActionResult =
  | { ok: true; invitation: Invitation }
  | {
      ok: false;
      reason: "invalid" | "closed" | "rate_limited" | "not_found" | "unavailable" | "error";
      message: string;
    };

/**
 * Server Action do RSVP. O formulário é um Client Component (react-hook-form
 * guarda as 3 etapas) que chama esta função com o corpo já montado, em vez de
 * usar `<form action>`: o resultado volta como valor e a tela decide a etapa.
 * Aqui a validação é refeita no servidor (nunca confie no cliente).
 */
export async function submitRsvp(token: string, body: RsvpBody): Promise<RsvpActionResult> {
  const parsed = RsvpRequest.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      message: parsed.error.issues[0]?.message ?? "Algum dado não confere. Revise e tente de novo.",
    };
  }

  const clientIp = clientIpFrom(await headers());
  const result = await apiWrite(
    "PUT",
    `/api/invitations/${encodeURIComponent(token)}/rsvp`,
    parsed.data,
    { clientIp, schema: RsvpResponse },
  );

  if (result.ok) return { ok: true, invitation: result.data.invitation };

  const { status, error } = result;
  if (error.code === ERROR_CODES.rsvpClosed) {
    return { ok: false, reason: "closed", message: error.message };
  }
  if (status === 429) return { ok: false, reason: "rate_limited", message: error.message };
  if (status === 404) {
    return {
      ok: false,
      reason: "not_found",
      message:
        "Este convite não existe mais. Confira o link ou busque seu nome em Confirmar presença.",
    };
  }
  if (status === 422) return { ok: false, reason: "invalid", message: error.message };
  if (error.code === "unavailable") {
    return {
      ok: false,
      reason: "unavailable",
      message:
        "Não conseguimos enviar sua resposta agora. Suas respostas continuam na tela: tente de novo em alguns instantes.",
    };
  }
  return { ok: false, reason: "error", message: error.message };
}
