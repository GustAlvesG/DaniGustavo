import { z } from "zod";
import { Email } from "./org.ts";
import { optionalText } from "./planning.ts";

/*
 * Fase 7, frente C: portal do fornecedor (docs/saas/fase-7.md).
 *
 * Painel: `/api/admin/events/:eventId/vendors/:eventVendorId/portal-links*` (vendors.read para
 * ver, vendors.portal para gerar/revogar). O link (`<API>/fornecedor/#<token>`) vai por e-mail,
 * vale `days` dias e pode ser usado várias vezes; revogável.
 * Portal (sem conta): `/api/vendor-portal/*`, isento de X-Web-Key, com
 * `Authorization: Bearer <token do link>`. O fornecedor vê o cronograma do dia (marcando os
 * itens dele), as tarefas atribuídas a ele, os próprios orçamentos e documentos; nunca
 * convidados nem valores de outros fornecedores.
 */

export const VENDOR_PORTAL_DEFAULT_DAYS = 30;
/** De onde veio o orçamento/documento: a equipe (painel) ou o fornecedor (portal). */
export const PORTAL_SOURCES = ["panel", "portal"] as const;
export type PortalSource = (typeof PORTAL_SOURCES)[number];
/** Selo do painel para o que o fornecedor enviou pelo portal. */
export const PORTAL_SOURCE_LABEL = "Enviado pelo fornecedor";
export const VENDOR_PORTAL_MAX_DAYS = 180;

/** POST /vendors/:eventVendorId/portal-links */
export const VendorPortalLinkInput = z.object({
  /** Padrão: o e-mail do fornecedor no catálogo (sem e-mail lá → 422 pedindo este campo). */
  email: Email.optional(),
  days: z.number().int().min(1).max(VENDOR_PORTAL_MAX_DAYS).default(VENDOR_PORTAL_DEFAULT_DAYS),
});
export type VendorPortalLinkInput = z.infer<typeof VendorPortalLinkInput>;

export interface VendorPortalLinkView {
  id: number;
  email: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  status: "active" | "expired" | "revoked";
}

/**
 * Resposta do POST: o link (o endereço com o token sai só aqui, uma vez, para a equipe poder
 * copiar e mandar por outro meio) e se o e-mail saiu.
 */
export interface VendorPortalLinkCreated {
  link: VendorPortalLinkView;
  url: string;
  emailSent: boolean;
}

/** GET /vendors/:eventVendorId/portal-links */
export interface VendorPortalLinksResponse {
  links: VendorPortalLinkView[];
}

/* ---------------------------- portal ---------------------------- */

/** GET /api/vendor-portal/me */
export interface VendorPortalMe {
  event: { name: string; startsAt: string | null; timezone: string };
  vendor: { name: string; category: string };
  expiresAt: string;
}

/** GET /api/vendor-portal/schedule: o roteiro do dia, com os itens do fornecedor marcados. */
export interface VendorPortalScheduleItem {
  date: string;
  startTime: string;
  endTime: string | null;
  title: string;
  location: string | null;
  /** Detalhes só nos itens do próprio fornecedor. */
  details: string | null;
  mine: boolean;
}
export interface VendorPortalSchedule {
  timezone: string;
  items: VendorPortalScheduleItem[];
}

/** GET /api/vendor-portal/tasks: tarefas com `event_tasks.event_vendor_id` = o fornecedor. */
export interface VendorPortalTask {
  id: number;
  title: string;
  description: string | null;
  dueOn: string | null;
  status: "todo" | "doing" | "done";
}

/** POST /api/vendor-portal/quotes: entra como "received" (source = portal). */
export const VendorPortalQuoteInput = z.object({
  title: z.string().trim().min(1, { error: "Dê um título ao orçamento." }).max(191),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(300),
        quantity: z.number().int().min(1).max(100_000).default(1),
        unitCents: z.number().int().min(0).max(1_000_000_000),
      }),
    )
    .min(1, { error: "Inclua pelo menos um item." })
    .max(200),
  discountCents: z.number().int().min(0).default(0),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  notes: z.string().trim().max(5000).nullable().default(null),
});
export type VendorPortalQuoteInput = z.infer<typeof VendorPortalQuoteInput>;

export interface VendorPortalQuote {
  id: number;
  title: string;
  status: "draft" | "received" | "approved" | "contracted" | "declined";
  totalCents: number;
  source: PortalSource;
  createdAt: string;
}

/** POST /api/vendor-portal/documents (multipart: `file` + estes campos). */
export const VendorPortalDocumentInput = z.object({
  title: z.string().trim().min(1, { error: "Dê um nome ao documento." }).max(191),
  notes: optionalText(2000),
});
export type VendorPortalDocumentInput = z.infer<typeof VendorPortalDocumentInput>;

/** Documento do fornecedor (área privada do Storage; mesmas regras do contrato). */
export interface VendorPortalDocument {
  id: number;
  title: string;
  originalName: string;
  mime: string;
  bytes: number;
  source: PortalSource;
  createdAt: string;
}
