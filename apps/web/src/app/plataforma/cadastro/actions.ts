"use server";

import { headers } from "next/headers";
import { SignupInput } from "@casamento/shared";
import { clientIpFrom } from "@/lib/api/client";
import { requestSignup } from "@/lib/api/platform";
import {
  fieldOf,
  signupFailureMessage,
  type SignupState,
  type SignupValues,
} from "@/components/plataforma/signup-state";

const text = (data: FormData, key: string) => {
  const v = data.get(key);
  return typeof v === "string" ? v : "";
};

/**
 * Server Action do cadastro (como um controller do Laravel que recebe o POST do formulário):
 * valida com o schema do contrato e manda à API com X-Web-Key e o IP do visitante (limite por
 * IP). A API responde 202 sempre, exista ou não conta com o e-mail; a senha só é pedida no
 * painel, depois que o link do e-mail confirma o endereço.
 */
export async function signupAction(_prev: SignupState, data: FormData): Promise<SignupState> {
  const values: SignupValues = {
    name: text(data, "name"),
    email: text(data, "email"),
    organizationName: text(data, "organizationName"),
    planCode: text(data, "planCode"),
  };
  const parsed = SignupInput.safeParse({
    ...values,
    planCode: values.planCode || null,
    acceptTerms: data.get("acceptTerms") === "on",
    website: text(data, "website"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: "error",
      field: issue ? fieldOf(issue.path) : undefined,
      message: issue?.message ?? "Confira os campos e tente de novo.",
      values,
    };
  }
  const result = await requestSignup(parsed.data, clientIpFrom(await headers()));
  if (!result.ok) return { status: "error", message: signupFailureMessage(result), values };
  return { status: "sent", email: parsed.data.email };
}
