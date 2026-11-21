import type { Database } from "@casamento/db";
import { ERROR_CODES, PAST_DUE_GRACE_DAYS } from "@casamento/shared";
import type { Context, MiddlewareHandler } from "hono";
import type { AdminUser } from "../admin/context.ts";
import { apiError } from "../errors.ts";
import type { EventAdminEnv, OrgAdminEnv } from "../tenancy/types.ts";
import { orgGateState } from "./service.ts";

/*
 * Fase 6, frente A: inadimplência. Depois da carência (`PAST_DUE_GRACE_DAYS`) o painel da
 * organização e dos eventos dela fica só leitura: escritas → 402 `subscription_inactive`,
 * exceto a própria assinatura (para conseguir pagar/trocar de plano) e o platform admin. Org
 * suspensa pelo platform admin: o mesmo. O site dos convidados (rotas públicas, pedidos, RSVP,
 * webhooks) nunca passa por aqui.
 */

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
/** Rotas da organização liberadas mesmo só leitura (é por onde se paga ou troca o plano). */
const BILLING_PATH = /^\/api\/admin\/orgs\/\d+\/(subscription|usage)(\/|$)/;

export const READ_ONLY_MESSAGE =
  `A assinatura está com pagamento em atraso há mais de ${PAST_DUE_GRACE_DAYS} dias (ou foi encerrada): ` +
  "o painel está só para consulta. Regularize em Plano e assinatura. O site dos convidados continua no ar.";
export const SUSPENDED_MESSAGE =
  "Esta organização está suspensa: o painel está só para consulta. Fale com o suporte da plataforma. " +
  "O site dos convidados continua no ar.";

/** Resposta 402 quando a escrita não pode passar; null = segue. */
async function blocked(
  c: Context,
  user: AdminUser,
  db: Database,
  orgId: number,
): Promise<Response | null> {
  if (SAFE.has(c.req.method) || user.platformRole === "admin") return null;
  const state = await orgGateState(db, orgId, new Date());
  if (state.suspended) {
    return apiError(c, 402, ERROR_CODES.subscriptionInactive, SUSPENDED_MESSAGE);
  }
  if (state.readOnly) {
    return apiError(c, 402, ERROR_CODES.subscriptionInactive, READ_ONLY_MESSAGE);
  }
  return null;
}

/** Painel de evento: a organização vem de `c.get("event").orgId`. */
export function eventSubscriptionGate(db: Database): MiddlewareHandler<EventAdminEnv> {
  return async (c, next) => {
    const res = await blocked(c, c.get("user"), db, c.get("event").orgId);
    if (res) return res;
    await next();
  };
}

/** Painel da organização: a organização vem de `c.get("org").id`. */
export function orgSubscriptionGate(db: Database): MiddlewareHandler<OrgAdminEnv> {
  return async (c, next) => {
    const res = BILLING_PATH.test(c.req.path)
      ? null
      : await blocked(c, c.get("user"), db, c.get("org").id);
    if (res) return res;
    await next();
  };
}
