import { z } from "zod";
import { OrderStatus, PaymentMethod } from "./gifts.ts";
import { SiteSections } from "./content.ts";
import { EventSides, EventType, SIDE_KEY_PATTERN, VocabularyOverrides } from "./event-types.ts";
import { EventModulesInput } from "./modules.ts";
import { AgeRange, RsvpStatus } from "./rsvp.ts";
import { ThemeSelection } from "./themes.ts";
import { HostPermissions } from "./permissions.ts";
import type { OrderSplitView } from "./payment-accounts.ts";
import {
  AccommodationItem,
  FaqItem,
  GodparentsManual,
  PaletteColor,
  ScheduleItem,
  SiteContent,
  MonogramArt,
} from "./site.ts";

/*
 * Contratos do painel dos noivos (/api/admin/*). Entradas validadas aqui servem à API e
 * ao formulário do painel; as mensagens já saem em pt-BR para aparecer ao lado do campo.
 */

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = (max: number, label: string) =>
  z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .max(max, { error: `${label}: use até ${max} caracteres.` })
      .nullable()
      .default(null),
  );

/** PUT /config: tipo, módulos, lados e palavras do evento (Fase 2, frente D). */
export const AdminEventConfigInput = z.object({
  type: EventType,
  modules: EventModulesInput,
  sides: EventSides,
  vocabulary: VocabularyOverrides,
});
export type AdminEventConfigInput = z.input<typeof AdminEventConfigInput>;

/* ------------------------------------------------------------------------ */
/* Convites                                                                  */
/* ------------------------------------------------------------------------ */

export const AdminGuestInput = z.object({
  /** Ausente: convidado novo. */
  id: z.number().int().positive().optional(),
  name: z
    .string()
    .trim()
    .min(2, { error: "Nome do convidado: informe pelo menos 2 letras." })
    .max(191, { error: "Nome do convidado: use até 191 caracteres." }),
  isChild: z.boolean().default(false),
  ageRange: AgeRange.nullable().default(null),
  rsvpStatus: RsvpStatus.default("pending"),
  dietaryNotes: optionalText(500, "Restrição alimentar"),
  phone: optionalText(32, "Telefone"),
  email: z.preprocess(
    blankToNull,
    z.email({ error: "E-mail do convidado inválido." }).max(191).nullable().default(null),
  ),
});
export type AdminGuestInput = z.input<typeof AdminGuestInput>;

export const AdminInvitationInput = z
  .object({
    label: z
      .string()
      .trim()
      .min(2, { error: "Nome do convite: informe pelo menos 2 letras." })
      .max(191, { error: "Nome do convite: use até 191 caracteres." }),
    side: z
      .string({ error: "Escolha o lado do convite." })
      .regex(SIDE_KEY_PATTERN, { error: "Escolha o lado do convite." }),
    maxGuests: z
      .number({ error: "Máximo de pessoas: informe um número." })
      .int()
      .min(1, { error: "Máximo de pessoas: pelo menos 1." })
      .max(30, { error: "Máximo de pessoas: até 30." }),
    allowPlusOne: z.boolean().default(false),
    contactEmail: z.preprocess(
      blankToNull,
      z.email({ error: "E-mail de contato inválido." }).max(191).nullable().default(null),
    ),
    contactPhone: optionalText(32, "Telefone de contato"),
    guests: z
      .array(AdminGuestInput)
      .min(1, { error: "Adicione pelo menos um convidado." })
      .max(30, { error: "Até 30 convidados por convite." }),
  })
  .superRefine((inv, ctx) => {
    if (inv.guests.length > inv.maxGuests) {
      ctx.addIssue({
        code: "custom",
        path: ["maxGuests"],
        message: `O convite tem ${inv.guests.length} convidados: aumente o máximo de pessoas.`,
      });
    }
  });
export type AdminInvitationInput = z.input<typeof AdminInvitationInput>;

/** Situação do convite inteiro, calculada pelos convidados. */
export const INVITATION_STATUSES = ["pending", "confirmed", "declined"] as const;
export const InvitationStatus = z.enum(INVITATION_STATUSES);
export type InvitationStatus = z.infer<typeof InvitationStatus>;

export interface AdminGuest {
  id: number;
  name: string;
  isChild: boolean;
  ageRange: AgeRange | null;
  isPlusOne: boolean;
  rsvpStatus: RsvpStatus;
  dietaryNotes: string | null;
  phone: string | null;
  email: string | null;
  respondedAt: string | null;
}

export interface AdminInvitation {
  id: number;
  token: string;
  label: string;
  side: string;
  maxGuests: number;
  allowPlusOne: boolean;
  contactEmail: string | null;
  contactPhone: string | null;
  sentAt: string | null;
  status: InvitationStatus;
  /** Link público do convite (SITE_URL/c/token). */
  link: string;
  guests: AdminGuest[];
  updatedAt: string;
}

export interface AdminRsvpLog {
  id: number;
  createdAt: string;
  /** Resumo legível da resposta (sem IP). */
  lines: string[];
}

/* ------------------------------------------------------------------------ */
/* Presentes                                                                 */
/* ------------------------------------------------------------------------ */

/** Caminho das imagens enviadas pelo painel (servidas pela API em /uploads). */
export const UPLOAD_PATH = /^\/uploads\/(?:\d{1,18}\/)?[0-9A-Z]{26}\.(?:jpg|png|webp)$/;
export const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const AdminGiftInput = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, { error: "Nome do presente: informe pelo menos 2 letras." })
      .max(191, { error: "Nome do presente: use até 191 caracteres." }),
    description: optionalText(2000, "Descrição"),
    category: z
      .string()
      .trim()
      .min(1, { error: "Escolha uma categoria." })
      .max(64, { error: "Categoria: use até 64 caracteres." }),
    priceCents: z
      .number({ error: "Preço: informe um valor." })
      .int()
      .min(100, { error: "Preço da cota: pelo menos R$ 1,00." })
      .max(10_000_000, { error: "Preço da cota: até R$ 100.000,00." }),
    quotaTotal: z
      .number({ error: "Cotas: informe um número." })
      .int()
      .min(1, { error: "Cotas: pelo menos 1." })
      .max(1000, { error: "Cotas: até 1000." }),
    openAmount: z.boolean().default(false),
    active: z.boolean().default(true),
    image: z.preprocess(
      blankToNull,
      z
        .string()
        .regex(UPLOAD_PATH, { error: "Imagem inválida: envie a foto pelo botão do painel." })
        .nullable()
        .default(null),
    ),
  })
  .strict();
export type AdminGiftInput = z.input<typeof AdminGiftInput>;

export const GiftOrderInput = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

export interface AdminGift {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  priceCents: number;
  quotaTotal: number;
  /** Cotas pagas. */
  quotaPaid: number;
  /** Cotas presas em pedidos pendentes (Pix aguardando). */
  quotaReserved: number;
  openAmount: boolean;
  active: boolean;
  image: string | null;
  sort: number;
  /** Tem pedidos: não pode ser excluído, só desativado. */
  hasOrders: boolean;
}

/* ------------------------------------------------------------------------ */
/* Pedidos                                                                   */
/* ------------------------------------------------------------------------ */

export const AdminOrdersQuery = z.object({
  status: OrderStatus.optional(),
  method: PaymentMethod.optional(),
  q: z.string().trim().max(100).optional(),
});

export interface AdminOrder {
  publicId: string;
  status: OrderStatus;
  statusDetail: string | null;
  method: PaymentMethod;
  provider: string;
  providerOrderId: string | null;
  gift: { id: number; title: string };
  quantity: number;
  amountCents: number;
  feeCents: number;
  totalCents: number;
  buyerName: string;
  buyerEmail: string;
  message: string | null;
  showOnWall: boolean;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  /** Fase 5 (frente C): conta que recebeu e taxa da plataforma; ausente nos pedidos antigos. */
  split?: OrderSplitView | null;
}

export interface AdminOrderDetail extends AdminOrder {
  payments: {
    gatewayId: string;
    method: PaymentMethod;
    gatewayStatus: string | null;
    grossCents: number;
    createdAt: string;
  }[];
  canRefund: boolean;
}

export interface ReconcileResult {
  checked: number;
  changed: { publicId: string; from: OrderStatus; to: OrderStatus }[];
  errors: number;
}

/* ------------------------------------------------------------------------ */
/* Recados                                                                   */
/* ------------------------------------------------------------------------ */

export interface AdminMessage {
  id: number;
  author: string;
  body: string;
  approved: boolean;
  /** Título do presente quando o recado veio com um pagamento. */
  giftTitle: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------------ */
/* Dashboard                                                                 */
/* ------------------------------------------------------------------------ */

export interface DashboardData {
  invitations: Record<InvitationStatus, number> & { total: number };
  guests: Record<RsvpStatus, number> & { total: number };
  /** Só confirmados. */
  attending: {
    adults: number;
    children: number;
    childrenByAge: Record<AgeRange | "sem-faixa", number>;
  };
  money: {
    grossCents: number;
    /** Bruto menos a taxa estimada do cartão (percentual de settings) nos pagamentos com cartão. */
    netCents: number;
    cardFeePercent: number;
    paidOrders: number;
    pendingOrders: number;
  };
  recentGifts: {
    publicId: string;
    buyerName: string;
    giftTitle: string;
    totalCents: number;
    message: string | null;
    paidAt: string;
  }[];
  rsvpDeadline: string;
  pendingMessages: number;
}

/* ------------------------------------------------------------------------ */
/* Configurações (tabela settings)                                           */
/* ------------------------------------------------------------------------ */

const isoDateTime = z.iso.datetime({
  offset: true,
  error: "Data inválida: use dia, mês, ano e hora.",
});

/** Local como fica guardado em settings (os links de mapa são calculados, salvo `mapsUrl`). */
export const StoredVenue = z.object({
  name: z.string().trim().min(1, { error: "Nome do local: obrigatório." }).max(191),
  address: z.string().trim().max(300),
  time: z.string().trim().max(40),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  /** Link de mapa escolhido pelos noivos; vazio usa o link calculado do endereço. */
  mapsUrl: z.preprocess(
    blankToNull,
    z.url({ error: "Link do mapa: use uma URL completa (https://…)." }).nullable().default(null),
  ),
});

const contact = SiteContent.shape.contact.extend({
  whatsapp: z.string().regex(/^(\d{12,13})?$/, {
    error: "WhatsApp: só dígitos com DDI e DDD, ex.: 5524999990000.",
  }),
  email: z.union([z.literal(""), z.email({ error: "E-mail de contato inválido." })]),
});

/** Schema de cada chave editável de settings. Chaves fora daqui não são aceitas. */
export const SETTINGS_SCHEMAS = {
  "couple.names": z.string().trim().min(1).max(120),
  "couple.monogram": z.string().trim().min(1).max(8),
  "couple.monogram_art": MonogramArt.nullable(),
  "calendar.uid": z.string().trim().min(1).max(191),
  "wedding.datetime": isoDateTime,
  "wedding.timezone": z.string().min(3).max(64),
  "ceremony.venue": StoredVenue,
  "reception.venue": StoredVenue,
  "rsvp.deadline": isoDateTime,
  "payments.card_fee_percent": z
    .number({ error: "Taxa do cartão: informe um número." })
    .min(0, { error: "Taxa do cartão: não pode ser negativa." })
    .max(20, { error: "Taxa do cartão: até 20%." }),
  "gifts.categories": z
    .array(
      z.object({
        slug: z
          .string()
          .regex(/^[a-z0-9-]{1,64}$/, { error: "Código da categoria: minúsculas, números e -." }),
        label: z.string().trim().min(1).max(64),
      }),
    )
    .min(1),
  "couple.contact": contact,
  "schedule.items": z.array(ScheduleItem),
  dresscode: SiteContent.shape.dressCode.extend({ palette: z.array(PaletteColor) }),
  "accommodation.items": z.array(AccommodationItem),
  "accommodation.how_to_get_there": z.string().max(4000),
  "faq.items": z.array(FaqItem),
  "godparents.manual": GodparentsManual,
  "gallery.official_soon": z.boolean(),
  seo: SiteContent.shape.seo,
  // Fase 2 (docs/saas/fase-2.md). `event.sides` é privado (a migration 0008 grava sem is_public).
  "site.sections": SiteSections,
  "site.theme": ThemeSelection,
  "event.modules": EventModulesInput,
  "event.sides": EventSides,
  "event.vocabulary": VocabularyOverrides,
  // Fase 3 (docs/saas/fase-3.md): privado, só a organização muda (rota em /orgs/:orgId).
  "event.host_permissions": HostPermissions,
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;

/**
 * Chaves com rota própria no painel (validação extra, revalidação certa): o PUT genérico de
 * /settings recusa. `site.sections` → /site; `site.theme` → /appearance; `event.*` → /config.
 */
export const DEDICATED_SETTINGS_KEYS: readonly SettingsKey[] = [
  "site.sections",
  "site.theme",
  "event.modules",
  "event.sides",
  "event.vocabulary",
  "event.host_permissions",
];
export const SETTINGS_KEYS = Object.keys(SETTINGS_SCHEMAS) as SettingsKey[];

export const SettingsUpdate = z.object({
  values: z.record(z.string(), z.unknown()),
});

/** Valida um lote de configurações; devolve a primeira mensagem de erro com a chave. */
export function parseSettings(
  values: Record<string, unknown>,
): { ok: true; data: Partial<Record<SettingsKey, unknown>> } | { ok: false; message: string } {
  const data: Partial<Record<SettingsKey, unknown>> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!(key in SETTINGS_SCHEMAS)) {
      return { ok: false, message: `Configuração desconhecida: ${key}.` };
    }
    const schema = SETTINGS_SCHEMAS[key as SettingsKey] as z.ZodType;
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? ` (${issue.path.join(".")})` : "";
      return { ok: false, message: `${key}${where}: ${issue?.message ?? "valor inválido"}` };
    }
    data[key as SettingsKey] = parsed.data;
  }
  return { ok: true, data };
}
