import type { Database } from "@casamento/db";
import type { Env } from "../env.ts";
import type { Storage } from "../storage/index.ts";

/*
 * Fase 6, frente C: rotina de retenção (diária). Para cada evento com `privacy.settings` ›
 * `retentionDays`, passado o prazo depois de `events.starts_at`, anonimiza convites (contatos e
 * nomes), compradores e recados (crossEvent) e grava `events.personal_data_purged_at`.
 * Reservado pela fundação e ligado em server.ts: hoje não faz nada.
 */
export interface RetentionJobDeps {
  env: Env;
  db: Database;
  storage?: Storage;
  now: () => Date;
}

export function startRetentionJob(deps: RetentionJobDeps): () => void {
  void deps;
  return () => {};
}
