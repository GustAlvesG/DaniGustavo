import type { Context } from "hono";
import { apiError, ERROR_CODES } from "../errors.ts";

/** Resposta das rotas da Fase 5 que a frente ainda vai implementar (some na integração). */
export const notYet = (c: Context, what: string) =>
  apiError(c, 501, ERROR_CODES.invalidRequest, `${what} ainda não disponível.`);
