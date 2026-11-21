import { ERROR_CODES } from "@casamento/shared";
import type { ApiFailure } from "@/lib/api/result";

/* Fase 6, frente B: estado do formulário de cadastro (puro, testado no Vitest). */

export type SignupField = "name" | "email" | "organizationName" | "acceptTerms";

export type SignupValues = {
  name: string;
  email: string;
  organizationName: string;
  planCode: string;
};

export type SignupState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string; field?: SignupField; values: SignupValues };

const FIELDS: readonly string[] = ["name", "email", "organizationName", "acceptTerms"];

/** Campo do formulário a partir do caminho do erro do zod. */
export function fieldOf(path: readonly PropertyKey[]): SignupField | undefined {
  const key = String(path[0]);
  return FIELDS.includes(key) ? (key as SignupField) : undefined;
}

/** Mensagem para a pessoa a partir da falha da API. */
export function signupFailureMessage(failure: ApiFailure): string {
  if (failure.status === 404) {
    return "O cadastro ainda não está aberto. Volte em breve: estamos preparando tudo com carinho.";
  }
  if (failure.error.code === ERROR_CODES.tooManyRequests || failure.status === 422) {
    return failure.error.message;
  }
  return "Não conseguimos enviar agora. Tente de novo em alguns minutos.";
}
