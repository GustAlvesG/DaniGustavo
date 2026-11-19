import type { EventStatus } from "@casamento/db";
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

/** Papel efetivo de quem acessa um evento pelo painel (do mais forte para o mais fraco). */
export const EVENT_ACCESS_ROLES = [
  "platform_admin",
  "org_owner",
  "org_member",
  "event_host",
] as const;
export type EventAccessRole = (typeof EVENT_ACCESS_ROLES)[number];

/** Rotas públicas `/api/e/:slug/*`. */
export type PublicEventEnv = { Variables: { event: EventCtx } };

/** Rotas do painel `/api/admin/events/:eventId/*` (depois de requireSession). */
export type EventAdminEnv = {
  Variables: { user: AdminUser; event: EventCtx; eventRole: EventAccessRole };
};
