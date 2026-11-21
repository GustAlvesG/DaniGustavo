import type { Database } from "@casamento/db";
import type { LimitKind } from "@casamento/shared";

/*
 * Fase 6, frente A (docs/saas/fase-6.md §2): limites do plano da organização. Reservado pela
 * fundação: hoje tudo passa. A frente A implementa lendo a assinatura (`plans.limits`) e o uso;
 * quem chama devolve 409 `plan_limit` com `limitMessage(kind, limit)` quando `ok` é false.
 *
 * Pontos de chamada (ver fase-6.md §2): criar/ativar evento (admin/org/events.ts, já ligado pela
 * fundação), convidados (admin/invitations.ts e importação), membros (convites da equipe),
 * espaço (storage) e módulos (admin/event-config.ts) — os quatro últimos ligados pela frente A.
 */

export type LimitCheck =
  | {
      kind: "activeEvents";
      /** Eventos que ficarão ativos a mais (1 ao ativar/criar ativo). */ adding: number;
    }
  | { kind: "guestsPerEvent"; eventId: number; adding: number }
  | { kind: "members"; adding: number }
  | { kind: "storageMb"; addingBytes: number }
  | { kind: "modules"; modules: string[] };

export type LimitResult = { ok: true } | { ok: false; kind: LimitKind; limit: number | null };

/** O plano da organização permite? (stub: sempre sim.) */
export function checkPlanLimit(
  db: Database,
  organizationId: number,
  check: LimitCheck,
): Promise<LimitResult> {
  void db;
  void organizationId;
  void check;
  return Promise.resolve({ ok: true });
}
