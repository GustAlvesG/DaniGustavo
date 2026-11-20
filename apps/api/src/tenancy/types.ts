import type { EventStatus } from "@casamento/db";
import {
  EVENT_ACCESS_ROLES,
  type EventAccessRole,
  type EventAction,
  type OrgAccessRole,
} from "@casamento/shared";
import type { AdminUser } from "../admin/context.ts";

/** O evento da requisição. Todo serviço com escopo recebe isto como 1º argumento. */
export interface EventCtx {
  id: number;
  slug: string;
  orgId: number;
  timezone: string;
  name: string;
  /** wedding, fifteen, birthday ou other (varchar no banco). */
  type: string;
  status: EventStatus;
  /** Início do evento (UTC); null se não definido. */
  startsAt: Date | null;
}

/** Papel efetivo de quem acessa um evento pelo painel (lista em `@casamento/shared`). */
export { EVENT_ACCESS_ROLES, type EventAccessRole };

/** Rotas públicas `/api/e/:slug/*`. */
export type PublicEventEnv = { Variables: { event: EventCtx } };

/** Rotas do painel `/api/admin/events/:eventId/*` (depois de requireSession). */
export type EventAdminEnv = {
  Variables: {
    user: AdminUser;
    event: EventCtx;
    eventRole: EventAccessRole;
    /** Ações negadas ao anfitrião neste evento (vazio para os outros papéis). */
    hostDeny?: readonly EventAction[];
  };
};

/** A organização da requisição em `/api/admin/orgs/:orgId/*` (Fase 3). */
export interface OrgCtx {
  id: number;
  slug: string;
  name: string;
  status: "active" | "suspended";
}

export { ORG_ACCESS_ROLES, type OrgAccessRole } from "@casamento/shared";

/** Rotas do painel da organização `/api/admin/orgs/:orgId/*` (depois de requireSession). */
export type OrgAdminEnv = {
  Variables: { user: AdminUser; org: OrgCtx; orgRole: OrgAccessRole };
};
