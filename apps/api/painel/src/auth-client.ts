import { createAuthClient } from "better-auth/react";

// Mesma origem da API: o cookie de sessão do Better Auth funciona sem CORS.
export const authClient = createAuthClient();

type AuthError = { code?: string; status?: number; message?: string } | null | undefined;

/** Traduz erros do Better Auth: diz o que houve e como resolver. */
export function describeError(error: AuthError): string {
  if (!error) return "Algo deu errado. Tente de novo.";
  if (error.status === 429) return "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "E-mail ou senha incorretos. Confira os dados e tente de novo.";
    case "INVALID_PASSWORD":
      return "A senha atual não confere. Digite de novo.";
    case "PASSWORD_TOO_SHORT":
      return "A nova senha precisa ter pelo menos 10 caracteres.";
  }
  if (error.status === undefined || error.status === 0)
    return "Sem conexão com a API. Verifique se o servidor está rodando e tente de novo.";
  return `Não foi possível concluir (${error.message ?? "erro desconhecido"}). Tente de novo.`;
}
