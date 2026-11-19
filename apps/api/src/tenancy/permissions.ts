import type { MiddlewareHandler } from "hono";
import { apiError, ERROR_CODES } from "../errors.ts";
import { EVENT_ACCESS_ROLES, type EventAccessRole, type EventAdminEnv } from "./types.ts";

/** Ações do painel sujeitas a permissão. */
export const ACTIONS = [
  "dashboard.read",
  "invitations.read",
  "invitations.write",
  "gifts.write",
  "orders.read",
  "orders.refund",
  "orders.reconcile",
  "messages.moderate",
  "settings.write",
  "reminders.write",
] as const;
export type Action = (typeof ACTIONS)[number];

const ALL = EVENT_ACCESS_ROLES;

/**
 * Matriz ação → papéis. Na Fase 1 todos os papéis podem tudo; fica explícita para que restringir
 * (ex.: reembolso só para org_owner) seja mudar uma linha.
 */
export const PERMISSIONS: Record<Action, readonly EventAccessRole[]> = {
  "dashboard.read": ALL,
  "invitations.read": ALL,
  "invitations.write": ALL,
  "gifts.write": ALL,
  "orders.read": ALL,
  "orders.refund": ALL,
  "orders.reconcile": ALL,
  "messages.moderate": ALL,
  "settings.write": ALL,
  "reminders.write": ALL,
};

export function can(role: EventAccessRole, action: Action): boolean {
  return PERMISSIONS[action].includes(role);
}

/** Depois de requireEventAccess: sem permissão para a ação → 403. */
export function requirePermission(action: Action): MiddlewareHandler<EventAdminEnv> {
  return async (c, next) => {
    if (!can(c.get("eventRole"), action)) {
      return apiError(
        c,
        403,
        ERROR_CODES.unauthorized,
        "Você não tem permissão para fazer isso neste evento.",
      );
    }
    await next();
  };
}
