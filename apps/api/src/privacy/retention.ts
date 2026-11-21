import { and, eq, events, inArray, isNotNull, isNull, type Database } from "@casamento/db";
import type { Env } from "../env.ts";
import { startIntervalJob, type JobOps } from "../jobs.ts";
import type { Storage } from "../storage/index.ts";
import { crossEvent } from "../tenancy/cross-event.ts";
import type { EventCtx } from "../tenancy/types.ts";
import { anonymizeInvitations, anonymizeOrders, deleteUnapprovedMessages } from "./anonymize.ts";
import { loadPrivacySettings, retentionDueAt } from "./settings.ts";

/*
 * Fase 6, frente C: rotina de retenção (diária). Para cada evento com `privacy.settings` ›
 * `retentionDays` (padrão 365), passado o prazo depois de `events.starts_at`, anonimiza convites
 * (nomes e contatos) e compradores e apaga os recados não aprovados; grava
 * `events.personal_data_purged_at`. Pedidos e valores ficam (contabilidade do recebedor).
 */
export interface RetentionJobDeps {
  env: Env;
  db: Database;
  storage?: Storage;
  now: () => Date;
}

export const RETENTION_INTERVAL_MS = 24 * 60 * 60_000;

export interface RetentionResult {
  /** Eventos anonimizados nesta rodada. */
  events: number[];
  invitations: number;
  orders: number;
  messages: number;
}

/**
 * Uma rodada da retenção. `eventIds` restringe a varredura (testes: o banco é compartilhado com
 * outros arquivos que rodam em paralelo).
 */
export async function runRetention(
  deps: Pick<RetentionJobDeps, "db" | "now">,
  opts: { eventIds?: number[] } = {},
): Promise<RetentionResult> {
  const { db } = deps;
  const now = deps.now();
  const result: RetentionResult = { events: [], invitations: 0, orders: 0, messages: 0 };
  if (opts.eventIds && opts.eventIds.length === 0) return result;

  const candidates: EventCtx[] = await crossEvent(
    "retenção: eventos com data e ainda não anonimizados",
    async () =>
      await db
        .select({
          id: events.id,
          slug: events.slug,
          orgId: events.organizationId,
          timezone: events.timezone,
          name: events.name,
          type: events.type,
          status: events.status,
          startsAt: events.startsAt,
        })
        .from(events)
        .where(
          and(
            isNull(events.personalDataPurgedAt),
            isNotNull(events.startsAt),
            opts.eventIds ? inArray(events.id, opts.eventIds) : undefined,
          ),
        ),
  );

  for (const ev of candidates) {
    const settings = await loadPrivacySettings(ev, db);
    const due = retentionDueAt(ev.startsAt, settings);
    if (!due || due.getTime() > now.getTime()) continue;
    await db.transaction(async (tx) => {
      result.invitations += await anonymizeInvitations(ev, tx, "all", now);
      result.orders += await anonymizeOrders(ev, tx, "all", now);
      result.messages += await deleteUnapprovedMessages(ev, tx);
      await tx
        .update(events)
        .set({ personalDataPurgedAt: now, updatedAt: now })
        .where(eq(events.id, ev.id));
    });
    result.events.push(ev.id);
  }
  return result;
}

export function startRetentionJob(
  deps: RetentionJobDeps & JobOps,
  intervalMs = RETENTION_INTERVAL_MS,
): () => void {
  return startIntervalJob(
    {
      name: "retenção",
      intervalMs,
      runAtStart: true,
      run: async () => {
        const r = await runRetention(deps);
        return r.events.length > 0
          ? `${r.events.length} evento(s) anonimizado(s) (${r.invitations} convite(s), ${r.orders} pedido(s), ${r.messages} recado(s) não aprovado(s) apagado(s)).`
          : null;
      },
    },
    deps,
  );
}
