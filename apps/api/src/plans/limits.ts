import {
  and,
  count,
  eq,
  events,
  gt,
  guests,
  isNull,
  organizationUsage,
  sql,
  teamInvites,
  type Database,
} from "@casamento/db";
import {
  ERROR_CODES,
  limitMessage,
  MODULES,
  modulesFor,
  type EventModulesInput,
  type LimitKind,
} from "@casamento/shared";
import type { Context } from "hono";
import { errorBody } from "../errors.ts";
import { countMembers, loadSubscription, parseLimits, storageUsage } from "./service.ts";

/*
 * Fase 6, frente A (docs/saas/fase-6.md §2 e §3): limites do plano da organização, conferidos
 * na escrita. Organização sem assinatura (legado) e plano interno (Cortesia) não têm limite.
 * Quem chama devolve 409 `plan_limit` com `limitMessage(kind, limit)` (ver `planLimitResponse`)
 * quando `ok` é false. Nada existente é apagado ou desligado por limite: só o que acrescenta
 * (`adding > 0`) é barrado.
 *
 * Pontos de chamada: criar/ativar evento (admin/org/events.ts), convidados (admin/invitations.ts
 * e importação), equipe (convite e aceite), espaço (uploads de fotos, presentes e contratos) e
 * módulos (admin/event-config.ts).
 */

export type LimitCheck =
  | {
      kind: "activeEvents";
      /** Eventos que ficarão ativos a mais (1 ao ativar/criar ativo). */ adding: number;
    }
  | { kind: "guestsPerEvent"; eventId: number; adding: number }
  | {
      kind: "members";
      adding: number;
      /** Conta os convites da equipe em aberto como vagas ocupadas (padrão: sim). */
      includePending?: boolean;
    }
  | { kind: "storageMb"; addingBytes: number }
  | {
      kind: "modules";
      /** Módulos que a escrita LIGA (os que já estavam ligados não contam). */ modules: string[];
    };

export type LimitResult = { ok: true } | { ok: false; kind: LimitKind; limit: number | null };
export type LimitFailure = Extract<LimitResult, { ok: false }>;

const MB = 1024 * 1024;
const OK: LimitResult = { ok: true };

/** O plano da organização permite? */
export async function checkPlanLimit(
  db: Database,
  organizationId: number,
  check: LimitCheck,
  now: Date = new Date(),
): Promise<LimitResult> {
  const current = await loadSubscription(db, organizationId);
  if (!current || current.sub.status === "internal") return OK;
  const limits = parseLimits(current.plan.limits);
  const fail = (limit: number | null): LimitResult => ({ ok: false, kind: check.kind, limit });

  switch (check.kind) {
    case "activeEvents": {
      if (limits.activeEvents === null || check.adding <= 0) return OK;
      const [row] = await db
        .select({ n: count() })
        .from(events)
        .where(and(eq(events.organizationId, organizationId), eq(events.status, "active")));
      const used = Number(row?.n ?? 0);
      return used + check.adding > limits.activeEvents ? fail(limits.activeEvents) : OK;
    }
    case "guestsPerEvent": {
      if (limits.guestsPerEvent === null || check.adding <= 0) return OK;
      const [row] = await db
        .select({ n: count() })
        .from(guests)
        .where(eq(guests.eventId, check.eventId));
      const used = Number(row?.n ?? 0);
      return used + check.adding > limits.guestsPerEvent ? fail(limits.guestsPerEvent) : OK;
    }
    case "members": {
      if (limits.members === null || check.adding <= 0) return OK;
      let used = await countMembers(db, organizationId);
      if (check.includePending ?? true) {
        const [row] = await db
          .select({ n: count() })
          .from(teamInvites)
          .where(
            and(
              eq(teamInvites.organizationId, organizationId),
              isNull(teamInvites.eventId),
              isNull(teamInvites.acceptedAt),
              isNull(teamInvites.revokedAt),
              gt(teamInvites.expiresAt, now),
            ),
          );
        used += Number(row?.n ?? 0);
      }
      return used + check.adding > limits.members ? fail(limits.members) : OK;
    }
    case "storageMb": {
      if (limits.storageMb === null || check.addingBytes <= 0) return OK;
      const { bytes } = await storageUsage(db, organizationId);
      return bytes + check.addingBytes > limits.storageMb * MB ? fail(limits.storageMb) : OK;
    }
    case "modules": {
      if (limits.modules === null || check.modules.length === 0) return OK;
      const allowed = new Set<string>(limits.modules);
      return check.modules.every((m) => allowed.has(m)) ? OK : fail(null);
    }
  }
}

/**
 * Módulos de um evento NOVO que o plano não inclui, já desligados (para gravar em
 * `event.modules`): o padrão do tipo liga tudo, e criar o evento não pode ligar o que o plano
 * não tem. null = nada a desligar (sem assinatura, plano interno ou sem restrição de módulos).
 */
export async function modulesOffForNewEvent(
  db: Database,
  organizationId: number,
  type: string,
): Promise<EventModulesInput | null> {
  const current = await loadSubscription(db, organizationId);
  if (!current || current.sub.status === "internal") return null;
  const { modules } = parseLimits(current.plan.limits);
  if (modules === null) return null;
  const allowed = new Set<string>(modules);
  const on = modulesFor(type, null);
  const off: EventModulesInput = {};
  for (const m of MODULES) if (on[m] && !allowed.has(m)) off[m] = false;
  return Object.keys(off).length > 0 ? off : null;
}

/** Resposta padrão do limite estourado: 409 `plan_limit` com a mensagem em pt-BR. */
export function planLimitResponse(c: Context, result: LimitFailure) {
  return c.json(errorBody(ERROR_CODES.planLimit, limitMessage(result.kind, result.limit)), 409);
}

/** Erro lançável (serviços sem `Context`, ex.: convites da equipe). */
export class PlanLimitError extends Error {
  readonly kind: LimitKind;
  readonly limit: number | null;
  constructor(result: LimitFailure) {
    super(limitMessage(result.kind, result.limit));
    this.name = "PlanLimitError";
    this.kind = result.kind;
    this.limit = result.limit;
  }
}

/** `checkPlanLimit` que lança `PlanLimitError`. */
export async function assertPlanLimit(
  db: Database,
  organizationId: number,
  check: LimitCheck,
  now?: Date,
): Promise<void> {
  const result = await checkPlanLimit(db, organizationId, check, now);
  if (!result.ok) throw new PlanLimitError(result);
}

/**
 * Soma (ou desconta) bytes no cache de espaço da organização logo depois de um upload, para o
 * próximo upload já ver o uso novo. A rotina recalcula o total pelo disco de tempos em tempos.
 */
export async function addStorageUsage(
  db: Database,
  organizationId: number,
  deltaBytes: number,
  now: Date = new Date(),
): Promise<void> {
  if (!deltaBytes) return;
  await db
    .insert(organizationUsage)
    .values({ organizationId, storageBytes: Math.max(0, deltaBytes), computedAt: now })
    .onDuplicateKeyUpdate({
      set: {
        storageBytes: sql`greatest(0, cast(${organizationUsage.storageBytes} as signed) + ${deltaBytes})`,
        updatedAt: now,
      },
    });
}
