import type { Context } from "hono";
import { apiError, ERROR_CODES } from "../errors.ts";
import { TeamInviteError } from "./service.ts";

const CODE: Record<TeamInviteError["status"], string> = {
  401: ERROR_CODES.unauthorized,
  403: ERROR_CODES.unauthorized,
  404: ERROR_CODES.notFound,
  409: ERROR_CODES.invalidRequest,
  422: ERROR_CODES.invalidRequest,
  502: ERROR_CODES.internalError,
};

/** Converte TeamInviteError em resposta; outro erro sobe para o onError da API. */
export async function handleInviteErrors(c: Context, fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TeamInviteError) {
      return apiError(c, err.status, CODE[err.status], err.message);
    }
    throw err;
  }
}

const ID = /^[1-9]\d{0,15}$/;
/** Id numérico da rota, ou null (vira 404). */
export const parseRouteId = (raw: string | undefined) =>
  raw && ID.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;
