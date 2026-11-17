import { expirePendingOrders, type OrderDeps } from "./orders/service.ts";

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
