import { eq, events } from "@casamento/db";
import type { ReminderSendResult } from "@casamento/shared";
import { expirePendingOrders, type OrderDeps } from "./orders/service.ts";
import { reconcileOrders } from "./orders/reconcile.ts";
import { refreshPendingAccounts, type AccountStatusDeps } from "./payment-accounts/status.ts";
import { runAutoReminders, type ReminderDeps } from "./reminders.ts";
import { crossEvent } from "./tenancy/cross-event.ts";
import { resolverFor } from "./tenancy/resolver.ts";
import type { Alerter } from "./alerts.ts";
import { createLogger, describeError, type Logger } from "./log.ts";

/** Fase 6: log estruturado e alerta da plataforma das rotinas (opcionais; padrão: texto, sem alerta). */
export interface JobOps {
  logger?: Logger;
  alerts?: Alerter;
}

const fallbackLogger = createLogger({ format: "texto" });

export interface IntervalJob {
  /** Nome curto, entra no log e na chave do alerta (ex.: "expiração"). */
  name: string;
  intervalMs: number;
  /** Roda uma vez ao subir (além de a cada intervalo). */
  runAtStart: boolean;
  /** Uma rodada; o texto devolvido (se houver) vai para o log como resumo. */
  run: () => Promise<string | null | undefined | void>;
}

/**
 * Rotina no próprio processo da API (o equivalente ao Scheduler do Laravel): uma rodada
 * lenta não se sobrepõe à próxima, falha vai para o log e para o alerta da plataforma (com
 * intervalo entre e-mails iguais) e o timer não segura o processo aberto. Devolve a função
 * que para a rotina (usada no desligamento). Outras rotinas (planos, retenção, tarefas)
 * podem usar o mesmo formato.
 */
export function startIntervalJob(job: IntervalJob, ops: JobOps = {}): () => void {
  const logger = ops.logger ?? fallbackLogger;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const summary = await job.run();
      if (summary) logger.info(`[${job.name}] ${summary}`, { job: job.name });
    } catch (err) {
      logger.error(`[${job.name}] falha na rotina`, { job: job.name, ...describeError(err) });
      await ops.alerts
        ?.notify({ key: `rotina:${job.name}`, title: `Rotina "${job.name}" falhou`, error: err })
        .catch(() => false);
    } finally {
      running = false;
    }
  };
  if (job.runAtStart) void tick();
  const timer = setInterval(() => void tick(), job.intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

/** A cada 5 minutos (PROMPT §6). */
export const EXPIRY_INTERVAL_MS = 5 * 60_000;

/**
 * Rotina de expiração no próprio processo da API (o equivalente ao Scheduler do Laravel):
 * expira pedidos pendentes vencidos e devolve as cotas. Roda uma vez ao subir e depois a
 * cada intervalo. Devolve a função que para a rotina (usada no desligamento).
 */
export function startExpiryJob(
  deps: OrderDeps & JobOps,
  intervalMs = EXPIRY_INTERVAL_MS,
): () => void {
  return startIntervalJob(
    {
      name: "expiração",
      intervalMs,
      runAtStart: true,
      run: async () => {
        const n = await expirePendingOrders(deps);
        return n > 0 ? `${n} pedido(s) pendente(s) expirado(s); cotas devolvidas.` : null;
      },
    },
    deps,
  );
}

/** Uma vez por dia (PROMPT §6). */
export const RECONCILE_INTERVAL_MS = 24 * 60 * 60_000;

/**
 * Conciliação diária com o provedor de pagamento, no mesmo processo da API. A primeira
 * rodada é depois de um intervalo (não a cada reinício do `node --watch`); o painel tem o
 * botão "Conferir com o provedor" para rodar na hora.
 */
export function startReconcileJob(
  deps: OrderDeps & JobOps,
  intervalMs = RECONCILE_INTERVAL_MS,
): () => void {
  return startIntervalJob(
    {
      name: "conciliação",
      intervalMs,
      runAtStart: false,
      run: async () => {
        const r = await reconcileOrders(null, deps);
        return `${r.checked} pedido(s) conferido(s), ${r.changed.length} corrigido(s), ${r.errors} falha(s).`;
      },
    },
    deps,
  );
}

/** De hora em hora: o lembrete é por dias antes do prazo, não precisa de mais precisão. */
export const REMINDER_INTERVAL_MS = 60 * 60_000;

/**
 * Uma rodada de lembretes em todos os eventos ativos, cada um com o seu event_settings
 * (configuração, prazo, fuso) e o seu host nos links. Falha num evento vai para o log e não
 * interrompe os outros. Devolve o resultado por evento (id → enviados/falhas, ou erro).
 */
export async function runReminderRound(
  deps: Omit<ReminderDeps, "ev"> & JobOps,
): Promise<Map<number, ReminderSendResult | Error>> {
  const resolver = resolverFor(deps.db, deps.eventResolver);
  const ids = await crossEvent("lembretes: eventos ativos", () =>
    deps.db.select({ id: events.id }).from(events).where(eq(events.status, "active")),
  );
  const results = new Map<number, ReminderSendResult | Error>();
  for (const { id } of ids) {
    try {
      const ev = await resolver.byId(id);
      if (!ev || ev.status !== "active") continue;
      results.set(id, await runAutoReminders({ ...deps, ev }));
    } catch (err) {
      (deps.logger ?? fallbackLogger).error("[lembretes] falha no evento", {
        eventId: id,
        ...describeError(err),
      });
      results.set(id, err instanceof Error ? err : new Error(String(err)));
    }
  }
  return results;
}

/**
 * Lembretes automáticos de RSVP (veja reminders.ts). Roda uma vez ao subir e depois a cada
 * hora; o registro em rsvp_reminders garante que reinícios e rodadas repetidas não duplicam
 * e-mails. Desligado no painel, a rodada não faz nada.
 */
export function startReminderJob(
  deps: Omit<ReminderDeps, "ev"> & JobOps,
  intervalMs = REMINDER_INTERVAL_MS,
): () => void {
  return startIntervalJob(
    {
      name: "lembretes",
      intervalMs,
      runAtStart: true,
      run: async () => {
        let sent = 0;
        let failed = 0;
        let broken = 0;
        for (const r of (await runReminderRound(deps)).values()) {
          if (r instanceof Error) {
            broken += 1;
            continue;
          }
          sent += r.sent;
          failed += r.failed;
        }
        if (broken > 0) {
          await deps.alerts
            ?.notify({
              key: "rotina:lembretes:evento",
              title: `Lembretes de RSVP falharam em ${broken} evento(s)`,
            })
            .catch(() => false);
        }
        return sent > 0 || failed > 0
          ? `${sent} lembrete(s) enviado(s), ${failed} falha(s).`
          : null;
      },
    },
    deps,
  );
}

/** A cada 6 horas (docs/saas/fase-5.md): subcontas ainda não aprovadas. */
export const ACCOUNT_STATUS_INTERVAL_MS = 6 * 60 * 60_000;

/**
 * Consulta a situação cadastral das subcontas pendentes, em análise ou recusadas (as aprovadas
 * e desativadas não são tocadas). A primeira rodada é depois de um intervalo; o webhook da
 * conta e o botão "Atualizar situação" cobrem o resto.
 */
export function startAccountStatusJob(
  deps: AccountStatusDeps & JobOps,
  intervalMs = ACCOUNT_STATUS_INTERVAL_MS,
): () => void {
  return startIntervalJob(
    {
      name: "contas",
      intervalMs,
      runAtStart: false,
      run: async () => {
        const n = await refreshPendingAccounts(deps);
        return n > 0 ? `${n} conta(s) com situação consultada.` : null;
      },
    },
    deps,
  );
}
