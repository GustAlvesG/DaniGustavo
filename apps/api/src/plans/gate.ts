import type { Database } from "@casamento/db";
import type { MiddlewareHandler } from "hono";

/*
 * Fase 6, frente A: inadimplência. Depois da carência (`PAST_DUE_GRACE_DAYS`) o painel da
 * organização e dos eventos dela fica só leitura: escritas → 402 `subscription_inactive`,
 * exceto a própria assinatura (para conseguir pagar/trocar de plano) e o platform admin. O site
 * dos convidados (rotas públicas, pedidos, RSVP) nunca passa por aqui.
 * Reservado pela fundação (montado em admin/index.ts): hoje deixa tudo passar.
 */

/** Painel de evento: a organização vem de `c.get("event").orgId`. */
export function eventSubscriptionGate(db: Database): MiddlewareHandler {
  void db;
  return (_c, next) => next();
}

/** Painel da organização: a organização vem de `c.get("org").id`. */
export function orgSubscriptionGate(db: Database): MiddlewareHandler {
  void db;
  return (_c, next) => next();
}
