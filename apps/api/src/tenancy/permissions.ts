import { EVENT_ACTIONS, type EventAction } from "@casamento/shared";
import type { MiddlewareHandler } from "hono";
import { apiError, ERROR_CODES } from "../errors.ts";
import { EVENT_ACCESS_ROLES, type EventAccessRole, type EventAdminEnv } from "./types.ts";

/** Ações do painel sujeitas a permissão (lista em `@casamento/shared` › permissions). */
export const ACTIONS = EVENT_ACTIONS;
export type Action = EventAction;

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
  "content.write": ALL,
  "event.configure": ALL,
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
