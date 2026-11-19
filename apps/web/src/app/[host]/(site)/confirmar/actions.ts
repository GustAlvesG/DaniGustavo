"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ERROR_CODES, LookupRequest, LookupResponse } from "@casamento/shared";
import { apiWrite, clientIpFrom } from "@/lib/api/client";

export type LookupValues = { firstName: string; lastName: string };

export type LookupState =
  | { status: "idle" }
  | { status: "invalid"; message: string; values: LookupValues }
  | { status: "not_found"; values: LookupValues }
  | { status: "rate_limited"; message: string; values: LookupValues }
  | { status: "error"; message: string; values: LookupValues }
  | { status: "choose"; matches: { token: string; label: string }[]; values: LookupValues };

const text = (data: FormData, key: string) => {
  const v = data.get(key);
  return typeof v === "string" ? v : "";
};

/**
 * Server Action da busca de convite (equivale a um POST de controller no
 * Laravel). Valida com o schema do contrato, repassa o IP do convidado para o
 * rate limit da API e responde com um estado para a tela.
 */
export async function lookupInvitation(_prev: LookupState, data: FormData): Promise<LookupState> {
  const values: LookupValues = {
    firstName: text(data, "firstName"),
    lastName: text(data, "lastName"),
  };
  const parsed = LookupRequest.safeParse({ ...values, website: text(data, "website") });
  if (!parsed.success) {
    return {
      status: "invalid",
      message: parsed.error.issues[0]?.message ?? "Confira os campos e tente de novo.",
      values,
    };
  }

  const clientIp = clientIpFrom(await headers());
  const result = await apiWrite("POST", "/api/invitations/lookup", parsed.data, {
    clientIp,
    schema: LookupResponse,
  });

  if (!result.ok) {
    if (result.error.code === ERROR_CODES.notFound) return { status: "not_found", values };
    if (result.status === 429) {
      return { status: "rate_limited", message: result.error.message, values };
    }
    return {
      status: "error",
      message:
        result.error.code === "unavailable"
          ? "Não conseguimos buscar agora. Espere um pouco e tente de novo, ou fale com os noivos."
          : result.error.message,
      values,
    };
  }

  const { matches } = result.data;
  // redirect() lança uma exceção de controle do Next: nada abaixo dele roda.
  if (matches.length === 1) redirect(`/c/${matches[0]!.token}`);
  return { status: "choose", matches, values };
}
