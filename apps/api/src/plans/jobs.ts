import type { Database } from "@casamento/db";
import type { Env } from "../env.ts";
import type { Mailer } from "../mailer.ts";

/*
 * Fase 6, frente A: rotina das assinaturas (fim do teste, vencidas → past_due, conferência no
 * provedor sem webhook) e do uso medido (espaço em disco por organização → organization_usage).
 * Reservado pela fundação e ligado em server.ts: hoje não faz nada.
 */
export interface SubscriptionJobDeps {
  env: Env;
  db: Database;
  mailer: Mailer;
  now: () => Date;
}

export function startSubscriptionJob(deps: SubscriptionJobDeps): () => void {
  void deps;
  return () => {};
}
