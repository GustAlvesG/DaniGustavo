import type { Database } from "@casamento/db";
import {
  EVENT_ACTIONS,
  HostPermissions,
  withDependents,
  type EventAction,
  type HostConfigurableAction,
} from "@casamento/shared";
import type { MiddlewareHandler } from "hono";
import { readSetting } from "../admin/event-settings.ts";
import { apiError, ERROR_CODES } from "../errors.ts";
import {
  EVENT_ACCESS_ROLES,
  type EventAccessRole,
  type EventAdminEnv,
  type EventCtx,
} from "./types.ts";

/** Ações do painel sujeitas a permissão (lista em `@casamento/shared` › permissions). */
export const ACTIONS = EVENT_ACTIONS;
export type Action = EventAction;

const ALL = EVENT_ACCESS_ROLES;

/**
 * Matriz ação → papéis. Todos os papéis podem tudo; fica explícita para que restringir
 * (ex.: reembolso só para org_owner) seja mudar uma linha. O anfitrião ainda passa pela lista
 * de negação do evento (`event.host_permissions`, ajustada pela organização).
 */
export const PERMISSIONS: Record<Action, readonly EventAccessRole[]> = {
  "dashboard.read": ALL,
  "invitations.read": ALL,
  "invitations.write": ALL,
  "gifts.read": ALL,
  "gifts.write": ALL,
  "orders.read": ALL,
  "orders.refund": ALL,
  "orders.reconcile": ALL,
  "messages.read": ALL,
  "messages.moderate": ALL,
  "settings.read": ALL,
  "settings.write": ALL,
  "reminders.read": ALL,
  "reminders.write": ALL,
  "content.read": ALL,
  "content.write": ALL,
  "event.configure": ALL,
  // Fase 4 (gestão do evento).
  "tasks.read": ALL,
  "tasks.write": ALL,
  "vendors.read": ALL,
  "vendors.write": ALL,
  "budget.read": ALL,
  "budget.write": ALL,
  "schedule.read": ALL,
  "schedule.write": ALL,
};

/** Chave em `event_settings` das ações negadas ao anfitrião (privada). */
export const HOST_PERMISSIONS_KEY = "event.host_permissions";

/**
 * `deny` só vale para `event_host`: dono, membro da organização e platform admin não são
 * afetados. `dashboard.read` nunca é negada (sem ela o anfitrião nem entra no evento).
 */
export function can(
  role: EventAccessRole,
  action: Action,
  deny: readonly EventAction[] = [],
): boolean {
  if (!PERMISSIONS[action].includes(role)) return false;
  return role !== "event_host" || action === "dashboard.read" || !deny.includes(action);
}

/** Ações liberadas para o papel (com a lista de negação, se for anfitrião). */
export function allowedActions(role: EventAccessRole, deny: readonly EventAction[] = []) {
  return ACTIONS.filter((a) => can(role, a, deny));
}

/**
 * Lista de negação efetiva do anfitrião no evento (já com as escritas que dependem de uma
 * leitura negada). Chave ausente ou inválida = pode tudo, o padrão.
 */
export async function loadHostDeny(ev: EventCtx, db: Database): Promise<HostConfigurableAction[]> {
  const parsed = HostPermissions.safeParse(await readSetting(ev, db, HOST_PERMISSIONS_KEY));
  return parsed.success ? withDependents(parsed.data.deny) : [];
}

/** Depois de requireEventAccess: sem permissão para a ação → 403. */
export function requirePermission(action: Action): MiddlewareHandler<EventAdminEnv> {
  return async (c, next) => {
    if (!can(c.get("eventRole"), action, c.get("hostDeny"))) {
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
