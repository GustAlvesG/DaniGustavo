import { events, inArray, type Database } from "@casamento/db";
import type { TestEvents } from "./helpers.ts";

/**
 * Fase 5: evento novo nasce com `payment_receiver = organization` e, sem conta aprovada, o pedido
 * de presente responde 409. Os testes de pedidos anteriores à Fase 5 cobram na conta principal,
 * como o casamento: este ajuste põe os eventos da fixture em `platform`.
 * TODO(integração): levar para `createTestEvents` (helpers.ts) e apagar este arquivo.
 */
export async function receiveOnPlatform(db: Database, t: TestEvents): Promise<void> {
  await db
    .update(events)
    .set({ paymentReceiver: "platform", receivingAccountId: null })
    .where(inArray(events.id, [t.eventA.id, t.eventB.id, t.draftA.id]));
}
