import { z } from "zod";
import { EventType } from "./event-types.ts";
import { EventHost, EventSlug, LocalDate, LocalTime, TimeZone } from "./org.ts";
import type { OrgAccessRole } from "./permissions.ts";

/* Fase 3, frente A (docs/saas/fase-3.md): eventos e dashboard da organização. */

/** POST /api/admin/orgs/:orgId/events */
export const CreateOrgEventInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Informe o nome do evento." })
    .max(191, { error: "Nome do evento: até 191 caracteres." }),
  type: EventType,
  slug: EventSlug,
  date: LocalDate,
  time: LocalTime.default("16:00"),
  timezone: TimeZone.default("America/Sao_Paulo"),
  /** Domínio próprio opcional (vira o host primário em `event_domains`). */
  host: z.union([z.literal(""), EventHost]).nullish(),
  /** Rascunho por padrão: o site só abre quando a organização ativa o evento. */
  status: z.enum(["draft", "active"]).default("draft"),
});
export type CreateOrgEventInput = z.infer<typeof CreateOrgEventInput>;

/** GET /api/admin/orgs/:orgId/events/slug?slug=… */
export interface SlugCheck {
  slug: string;
  available: boolean;
  /** Motivo em pt-BR quando indisponível ou inválido. */
  message: string | null;
}

/** Linha do dashboard multievento (e da lista de eventos da organização). */
export interface OrgEventSummary {
  id: number;
  slug: string;
  name: string;
  type: string;
  status: "draft" | "active" | "archived";
  timezone: string;
  startsAt: string | null;
  primaryHost: string | null;
  invitations: number;
  /** Convidados cadastrados (todas as pessoas dos convites). */
  guests: number;
  /** Convidados que confirmaram presença. */
  confirmed: number;
  /** Pedidos pagos (presentes recebidos). */
  giftsPaid: number;
  /** Total recebido em presentes, em centavos (pedidos pagos, sem reembolsados). */
  giftsReceivedCents: number;
}

/** GET /api/admin/orgs/:orgId/dashboard */
export interface OrgDashboard {
  organization: { id: number; slug: string; name: string };
  role: OrgAccessRole;
  events: OrgEventSummary[];
  totals: { events: number; guests: number; confirmed: number; giftsReceivedCents: number };
}
