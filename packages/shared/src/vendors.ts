import { z } from "zod";
import { Email, LocalDate } from "./org.ts";
import { EventVendorStatus, optionalText, VendorCategoryKey } from "./planning.ts";

/*
 * Fase 4, frente B: catálogo de fornecedores da organização, fornecedores do evento e
 * contratos (docs/saas/fase-4.md). Rotas: `/api/admin/orgs/:orgId/vendors*`,
 * `/api/admin/events/:eventId/vendor-catalog` e `/api/admin/events/:eventId/vendors*`.
 */

/** Contrato: PDF ou imagem, conferido pelos bytes, até 10 MB. */
export const CONTRACT_MAX_BYTES = 10 * 1024 * 1024;
export const CONTRACT_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type ContractMime = (typeof CONTRACT_MIME)[number];

/** POST /vendors (catálogo). */
export const VendorInput = z.object({
  name: z.string().trim().min(1, { error: "Informe o nome do fornecedor." }).max(191),
  category: VendorCategoryKey,
  contactName: optionalText(191),
  email: Email.nullish().transform((v) => v ?? null),
  phone: optionalText(32),
  website: optionalText(300),
  /** CPF ou CNPJ; a API guarda só os dígitos (11 ou 14). */
  document: optionalText(20),
  notes: optionalText(5000),
  rating: z.number().int().min(1).max(5).nullable().default(null),
});
export type VendorInput = z.infer<typeof VendorInput>;
/** PATCH /vendors/:vendorId (parcial). */
export const VendorUpdate = VendorInput.partial().extend({
  // Sem o padrão (null) do POST: no zod 4 o `.partial()` o aplicaria e apagaria a avaliação.
  rating: z.number().int().min(1).max(5).nullable().optional(),
  /** true arquiva (some das listas de escolha); false desarquiva. */
  archived: z.boolean().optional(),
});
export type VendorUpdate = z.infer<typeof VendorUpdate>;

export interface VendorRow {
  id: number;
  name: string;
  category: VendorCategoryKey;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  document: string | null;
  notes: string | null;
  rating: number | null;
  archived: boolean;
  /** Em quantos eventos da organização o fornecedor está. */
  eventCount: number;
}

/**
 * POST /api/admin/events/:eventId/vendors: liga um fornecedor do catálogo (`vendorId`) ou
 * cadastra um novo no catálogo da organização e já liga (`vendor`).
 */
export const EventVendorInput = z
  .object({
    vendorId: z.number().int().positive().optional(),
    vendor: VendorInput.optional(),
    /** Padrão: a categoria do catálogo. */
    category: VendorCategoryKey.optional(),
    status: EventVendorStatus.default("prospect"),
    notes: optionalText(5000),
  })
  .refine((v) => (v.vendorId === undefined) !== (v.vendor === undefined), {
    error: "Escolha um fornecedor do catálogo ou cadastre um novo.",
  });
export type EventVendorInput = z.infer<typeof EventVendorInput>;

/** PATCH /api/admin/events/:eventId/vendors/:eventVendorId */
export const EventVendorUpdate = z.object({
  category: VendorCategoryKey.optional(),
  status: EventVendorStatus.optional(),
  notes: optionalText(5000).optional(),
});
export type EventVendorUpdate = z.infer<typeof EventVendorUpdate>;

export interface EventVendorRow {
  id: number;
  vendor: Pick<
    VendorRow,
    "id" | "name" | "category" | "contactName" | "email" | "phone" | "website" | "rating"
  >;
  category: VendorCategoryKey;
  status: EventVendorStatus;
  notes: string | null;
  contractCount: number;
}

/** Campos do multipart de POST /vendors/:eventVendorId/contracts (além de `file`). */
export const ContractMeta = z.object({
  title: z.string().trim().min(1, { error: "Dê um nome ao contrato." }).max(191),
  signedOn: LocalDate.nullish().transform((v) => v ?? null),
  notes: optionalText(5000),
});
export type ContractMeta = z.infer<typeof ContractMeta>;

export interface ContractRow {
  id: number;
  eventVendorId: number;
  title: string;
  originalName: string;
  mime: ContractMime;
  bytes: number;
  signedOn: string | null;
  notes: string | null;
  createdAt: string;
  /** GET autenticado do painel; nunca /uploads. */
  downloadUrl: string;
}
