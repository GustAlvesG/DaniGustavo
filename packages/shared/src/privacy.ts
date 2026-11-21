import { z } from "zod";
import { Email } from "./org.ts";

/*
 * Fase 6, frente C (docs/saas/fase-6.md): LGPD — consentimento no RSVP e no mural, privacidade
 * e retenção por evento, pedidos dos titulares, exportação, anonimização e exclusão de evento.
 */

/** Versão do aviso de privacidade mostrado no RSVP e no mural (gravada com o aceite). */
export const PRIVACY_NOTICE_VERSION = "2026-11";

/**
 * Pedido pago/reembolsado mais novo que isto bloqueia apagar o evento: janela de contestação do
 * cartão (até 180 dias) e do MED do Pix (até 90). Depois dela o evento pode ser apagado e os
 * pedidos saem junto; fica só o resumo sem dado pessoal (`event_deletions`).
 */
export const EVENT_DELETION_ORDER_WINDOW_DAYS = 180;

/** Retenção padrão: dias depois da data do evento até anonimizar convidados e compradores. */
export const DEFAULT_RETENTION_DAYS = 365;

/**
 * `event_settings` › `privacy.settings` (privada; rota própria). Controla consentimento,
 * contato do controlador e retenção do evento.
 */
export const PrivacySettings = z.object({
  /** RSVP e mural exigem o aceite do aviso (padrão: sim). */
  requireConsent: z.boolean().default(true),
  /** E-mail que responde pelos dados do evento (mostrado no aviso). null = e-mail da organização. */
  contactEmail: Email.nullable().default(null),
  /** Dias depois do evento para anonimizar dados pessoais; null = não anonimizar sozinho. */
  retentionDays: z.number().int().min(30).max(3650).nullable().default(DEFAULT_RETENTION_DAYS),
});
export type PrivacySettings = z.infer<typeof PrivacySettings>;

export const PRIVACY_REQUEST_KINDS = ["access", "correction", "erasure", "other"] as const;
export const PrivacyRequestKind = z.enum(PRIVACY_REQUEST_KINDS, {
  error: "Tipo de pedido inválido.",
});
export type PrivacyRequestKind = z.infer<typeof PrivacyRequestKind>;
export const PRIVACY_REQUEST_KIND_LABELS: Record<PrivacyRequestKind, string> = {
  access: "Ver meus dados",
  correction: "Corrigir meus dados",
  erasure: "Apagar meus dados",
  other: "Outro assunto",
};
export const PRIVACY_REQUEST_STATUSES = ["open", "done", "rejected"] as const;
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

/** POST /api/e/:slug/privacy-requests (público; honeypot `website`, rate limit por IP). */
export const PrivacyRequestInput = z.object({
  kind: PrivacyRequestKind,
  name: z.string().trim().min(1, { error: "Informe seu nome." }).max(191),
  email: Email,
  message: z.string().trim().max(2000).nullish(),
  website: z.string().max(200).optional(),
});
export type PrivacyRequestInput = z.infer<typeof PrivacyRequestInput>;

/** GET /api/admin/events/:eventId/privacy/requests */
export interface PrivacyRequestView {
  id: number;
  kind: PrivacyRequestKind;
  name: string;
  email: string;
  message: string | null;
  status: PrivacyRequestStatus;
  response: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

/** PATCH /api/admin/events/:eventId/privacy/requests/:id */
export const PrivacyRequestUpdate = z.object({
  status: z.enum(["done", "rejected"]),
  response: z.string().trim().max(5000).nullish(),
});
export type PrivacyRequestUpdate = z.infer<typeof PrivacyRequestUpdate>;

/**
 * POST /api/admin/events/:eventId/privacy/anonymize: troca por marcadores os dados pessoais de
 * convites e/ou pedidos escolhidos (pedido de exclusão de um titular).
 */
export const AnonymizeInput = z
  .object({
    invitationIds: z.array(z.number().int().positive()).max(500).default([]),
    orderIds: z.array(z.number().int().positive()).max(500).default([]),
  })
  .refine((v) => v.invitationIds.length + v.orderIds.length > 0, {
    error: "Escolha ao menos um convite ou pedido.",
  });
export type AnonymizeInput = z.infer<typeof AnonymizeInput>;

/* ------------------------------------------------------------------------ */
/* Apagar evento (/api/admin/orgs/:orgId/events/:eventId/deletion)           */
/* ------------------------------------------------------------------------ */

/** Motivos que impedem apagar agora. */
export const DELETION_BLOCKERS = ["not_archived", "recent_orders", "pending_orders"] as const;
export type DeletionBlocker = (typeof DELETION_BLOCKERS)[number];

/** GET …/deletion: o que será apagado e o que impede. */
export interface EventDeletionPreview {
  eventId: number;
  slug: string;
  name: string;
  counts: {
    invitations: number;
    guests: number;
    orders: number;
    messages: number;
    media: number;
    contracts: number;
  };
  blockers: { code: DeletionBlocker; message: string }[];
  /** A partir de quando dá para apagar (fim da janela de contestação), se for esse o bloqueio. */
  deletableFrom: string | null;
}

/** POST …/deletion (dono): digitar o slug do evento confirma. */
export const EventDeletionInput = z.object({ confirmSlug: z.string().trim().min(1).max(64) });
export type EventDeletionInput = z.infer<typeof EventDeletionInput>;

/** GET /api/admin/me/export: dados da própria conta (sem segredos). */
export interface MyDataExport {
  exportedAt: string;
  user: { id: string; name: string; email: string; createdAt: string };
  organizations: { id: number; name: string; role: string }[];
  events: { id: number; name: string; role: string }[];
  legalAcceptances: { document: string; version: string; acceptedAt: string }[];
}
