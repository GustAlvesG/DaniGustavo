import { eq, events } from "@casamento/db";
import type { ReminderSendResult } from "@casamento/shared";
import { expirePendingOrders, type OrderDeps } from "./orders/service.ts";
import { reconcileOrders } from "./orders/reconcile.ts";
import { runAutoReminders, type ReminderDeps } from "./reminders.ts";
import { crossEvent } from "./tenancy/cross-event.ts";
import { resolverFor } from "./tenancy/resolver.ts";

/** A cada 5 minutos (PROMPT §6). */
export const EXPIRY_INTERVAL_MS = 5 * 60_000;

/**
 * Rotina de expiração no próprio processo da API (o equivalente ao Scheduler do Laravel):
 * expira pedidos pendentes vencidos e devolve as cotas. Roda uma vez ao subir e depois a
 * cada intervalo. Devolve a função que para a rotina (usada no desligamento).
 */
export function startExpiryJob(deps: OrderDeps, intervalMs = EXPIRY_INTERVAL_MS): () => void {
  let running = false;
  const tick = async () => {
    if (running) return; // uma rodada lenta não se sobrepõe à próxima
    running = true;
    try {
      const n = await expirePendingOrders(deps);
      if (n > 0) console.log(`[pedidos] ${n} pedido(s) pendente(s) expirado(s); cotas devolvidas.`);
    } catch (err) {
      console.error("[pedidos] Falha na rotina de expiração:", err);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref(); // não segura o processo aberto sozinho
  return () => clearInterval(timer);
}

/** Uma vez por dia (PROMPT §6). */
export const RECONCILE_INTERVAL_MS = 24 * 60 * 60_000;

/**
 * Conciliação diária com o provedor de pagamento, no mesmo processo da API. A primeira
 * rodada é depois de um intervalo (não a cada reinício do `node --watch`); o painel tem o
 * botão "Conferir com o provedor" para rodar na hora.
 */
export function startReconcileJob(deps: OrderDeps, intervalMs = RECONCILE_INTERVAL_MS): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await reconcileOrders(null, deps);
      console.log(
        `[conciliação] ${r.checked} pedido(s) conferido(s), ${r.changed.length} corrigido(s), ${r.errors} falha(s).`,
      );
    } catch (err) {
      console.error("[conciliação] Falha na rotina diária:", err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

/** De hora em hora: o lembrete é por dias antes do prazo, não precisa de mais precisão. */
export const REMINDER_INTERVAL_MS = 60 * 60_000;

/**
 * Uma rodada de lembretes em todos os eventos ativos, cada um com o seu event_settings
 * (configuração, prazo, fuso) e o seu host nos links. Falha num evento vai para o log e não
 * interrompe os outros. Devolve o resultado por evento (id → enviados/falhas, ou erro).
 */
export async function runReminderRound(
  deps: Omit<ReminderDeps, "ev">,
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
      console.error(`[lembretes] Falha no evento ${id}:`, err);
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
  deps: Omit<ReminderDeps, "ev">,
  intervalMs = REMINDER_INTERVAL_MS,
): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      let sent = 0;
      let failed = 0;
      for (const r of (await runReminderRound(deps)).values()) {
        if (r instanceof Error) continue;
        sent += r.sent;
        failed += r.failed;
      }
      if (sent > 0 || failed > 0) {
        console.log(`[lembretes] ${sent} lembrete(s) enviado(s), ${failed} falha(s).`);
      }
    } catch (err) {
      console.error("[lembretes] Falha na rotina de lembretes:", err);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
