import type { Database } from "@casamento/db";
import type { Mailer } from "../mailer.ts";
import type { EventCtx } from "../tenancy/types.ts";

/*
 * Fase 7, frente D (docs/saas/fase-7.md §3): acompanhantes contam no limite de convidados do
 * plano, mas o RSVP nunca é recusado. Depois de gravar um RSVP, o `routes/invitations.ts`
 * chama esta função: se o evento passou do limite e ainda não avisou este estouro, manda
 * e-mail à equipe (hosts e owners, como os avisos de RSVP) e grava `event_settings` ›
 * `plan.guest_overage` ({ notifiedAt, used, limit }, privada). Nunca lança (falha vira log).
 * Stub da fundação: não faz nada (e ainda não é chamada).
 */
export async function notifyGuestOverage(
  ev: EventCtx,
  deps: { db: Database; mailer: Mailer; now?: () => Date },
): Promise<void> {
  void ev;
  void deps;
}
