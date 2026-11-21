import { events, organizations, organizationUsage, type Database } from "@casamento/db";
import { createSubscriptionProvider, type SubscriptionProvider } from "../billing/index.ts";
import type { Env } from "../env.ts";
import { startIntervalJob, type JobOps } from "../jobs.ts";
import type { Mailer } from "../mailer.ts";
import { createLocalStorage, type Storage } from "../storage/index.ts";
import { crossEvent } from "../tenancy/cross-event.ts";
import { runSubscriptionRound } from "./subscriptions.ts";

/*
 * Fase 6, frente A: rotina das assinaturas (fim do teste, vencidas → past_due, conferência no
 * provedor sem webhook) e do uso medido (espaço em disco por organização → organization_usage).
 * De hora em hora; o espaço em disco a cada 6 rodadas (ler as pastas é mais caro).
 */
export interface SubscriptionJobDeps {
  env: Env;
  db: Database;
  mailer: Mailer;
  now: () => Date;
  /** Padrão: o provedor do .env (mesma instância do app). */
  billing?: SubscriptionProvider;
  /** Padrão: disco local em UPLOAD_DIR. */
  storage?: Storage;
}

export const SUBSCRIPTION_INTERVAL_MS = 60 * 60_000;
const STORAGE_EVERY = 6;
const FIRST_RUN_DELAY_MS = 60_000;

/** Recalcula o espaço em disco de todas as organizações pelos arquivos de cada evento. */
export async function refreshStorageUsage(
  db: Database,
  storage: Storage,
  now: Date,
): Promise<number> {
  const [orgs, evs] = await crossEvent(
    "uso de disco: todas as organizações",
    async () =>
      await Promise.all([
        db.select({ id: organizations.id }).from(organizations),
        db.select({ id: events.id, orgId: events.organizationId }).from(events),
      ]),
  );
  const totals = new Map<number, number>(orgs.map((o) => [o.id, 0]));
  for (const e of evs) {
    totals.set(e.orgId, (totals.get(e.orgId) ?? 0) + (await storage.usageBytes(e.id)));
  }
  for (const [organizationId, bytes] of totals) {
    await db
      .insert(organizationUsage)
      .values({ organizationId, storageBytes: bytes, computedAt: now })
      .onDuplicateKeyUpdate({ set: { storageBytes: bytes, computedAt: now, updatedAt: now } });
  }
  return totals.size;
}

export function startSubscriptionJob(
  deps: SubscriptionJobDeps & JobOps,
  intervalMs = SUBSCRIPTION_INTERVAL_MS,
): () => void {
  const billing = deps.billing ?? createSubscriptionProvider(deps.env);
  const storage = deps.storage ?? createLocalStorage(deps.env.UPLOAD_DIR);
  let ticks = 0;
  return startIntervalJob(
    {
      name: "assinaturas",
      intervalMs,
      // Primeira rodada um pouco depois de subir (não a cada reinício do `node --watch` em dev).
      runAtStart: true,
      firstRunDelayMs: FIRST_RUN_DELAY_MS,
      run: async () => {
        try {
          const r = await runSubscriptionRound({ ...deps, billing });
          if (ticks % STORAGE_EVERY === 0) await refreshStorageUsage(deps.db, storage, deps.now());
          return r.synced || r.trialsEnded || r.errors
            ? `${r.synced} conferida(s) no provedor, ${r.trialsEnded} teste(s) encerrado(s), ${r.errors} falha(s).`
            : null;
        } finally {
          ticks += 1;
        }
      },
    },
    deps,
  );
}
