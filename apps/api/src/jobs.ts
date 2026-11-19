import { expirePendingOrders, type OrderDeps } from "./orders/service.ts";
import { reconcileOrders } from "./orders/reconcile.ts";
import { runAutoReminders, type ReminderDeps } from "./reminders.ts";
import { legacyEvent } from "./tenancy/legacy.ts";
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
      // TODO(fase1-etapa6): iterar os eventos ativos em vez de só o evento 1.
      const ev = await legacyEvent(resolverFor(deps.db));
      const r = await runAutoReminders({ ...deps, ev });
      if (r.sent > 0 || r.failed > 0) {
        console.log(`[lembretes] ${r.sent} lembrete(s) enviado(s), ${r.failed} falha(s).`);
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
