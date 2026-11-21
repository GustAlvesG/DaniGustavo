import { z } from "zod";
import { isValidCpf } from "./gifts.ts";

/*
 * Fase 5 (docs/saas/fase-5.md): recebimentos. O dinheiro dos presentes cai numa subconta do
 * provedor (Asaas) da organização ou de uma pessoa dela (o anfitrião) e a plataforma recebe a
 * taxa por split. Arquivo da integração: as frentes só acrescentam (sem mudar o que existe).
 * As listas repetem as do schema (`@casamento/db` › tenancy); um teste do db confere.
 */

/* ------------------------------------------------------------------------ */
/* Listas                                                                    */
/* ------------------------------------------------------------------------ */

/** Quem recebe o dinheiro dos presentes de um evento (`events.payment_receiver`). */
export const PAYMENT_RECEIVERS = ["organization", "host", "platform"] as const;
export const PaymentReceiver = z.enum(PAYMENT_RECEIVERS, { error: "Recebedor inválido." });
export type PaymentReceiver = z.infer<typeof PaymentReceiver>;

export const PAYMENT_RECEIVER_LABELS: Record<PaymentReceiver, string> = {
  organization: "Conta da organização",
  host: "Conta do anfitrião",
  platform: "Conta da plataforma (sem taxa)",
};

/** Titular da subconta. */
export const PAYMENT_ACCOUNT_HOLDERS = ["organization", "user"] as const;
export type PaymentAccountHolder = (typeof PAYMENT_ACCOUNT_HOLDERS)[number];

export const PAYMENT_ACCOUNT_PERSON_TYPES = ["individual", "company"] as const;
export const PaymentAccountPersonType = z.enum(PAYMENT_ACCOUNT_PERSON_TYPES, {
  error: "Escolha pessoa física ou jurídica.",
});
export type PaymentAccountPersonType = z.infer<typeof PaymentAccountPersonType>;

/** Tipos de empresa aceitos pelo Asaas (`companyType`). */
export const COMPANY_TYPES = ["MEI", "LIMITED", "INDIVIDUAL", "ASSOCIATION"] as const;
export const CompanyType = z.enum(COMPANY_TYPES, { error: "Tipo de empresa inválido." });
export type CompanyType = z.infer<typeof CompanyType>;

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  MEI: "MEI",
  LIMITED: "Sociedade limitada (Ltda.)",
  INDIVIDUAL: "Empresa individual",
  ASSOCIATION: "Associação",
};

/** Situação cadastral (KYC) da subconta, já no nosso vocabulário. */
export const PAYMENT_ACCOUNT_STATUSES = [
  "pending",
  "awaiting_approval",
  "approved",
  "rejected",
  "disabled",
] as const;
export const PaymentAccountStatus = z.enum(PAYMENT_ACCOUNT_STATUSES);
export type PaymentAccountStatus = z.infer<typeof PaymentAccountStatus>;

export const PAYMENT_ACCOUNT_STATUS_LABELS: Record<PaymentAccountStatus, string> = {
  pending: "Cadastro pendente",
  awaiting_approval: "Em análise",
  approved: "Aprovada",
  rejected: "Recusada",
  disabled: "Desativada",
};

/** Situação de cada etapa no provedor (Asaas: PENDING, AWAITING_APPROVAL, APPROVED, REJECTED). */
export const KYC_STEP_STATUSES = ["pending", "awaiting_approval", "approved", "rejected"] as const;
export const KycStepStatus = z.enum(KYC_STEP_STATUSES);
export type KycStepStatus = z.infer<typeof KycStepStatus>;

/** Situação de um grupo de documentos pedido pelo provedor. */
export const KYC_DOCUMENT_STATUSES = [
  "not_sent",
  "pending",
  "approved",
  "rejected",
  "ignored",
] as const;
export const KycDocumentStatus = z.enum(KYC_DOCUMENT_STATUSES);
export type KycDocumentStatus = z.infer<typeof KycDocumentStatus>;

/* ------------------------------------------------------------------------ */
/* Taxa da plataforma                                                        */
/* ------------------------------------------------------------------------ */

/** Teto do percentual de split da plataforma (sanidade da configuração). */
export const PLATFORM_FEE_MAX_PERCENT = 50;

/** Percentual → centésimos de ponto percentual (2,5 → 250), sem erro de ponto flutuante. */
export const feePercentToBps = (percent: number) => Math.round(percent * 100);

/**
 * Estimativa da taxa da plataforma em centavos. O Asaas calcula o split sobre o valor líquido
 * (depois da taxa dele), então o valor real pode ser um pouco menor: o painel mostra
 * `platformFeeCents` do pedido quando o provedor informa e esta estimativa até lá.
 */
export function estimatePlatformFeeCents(amountCents: number, feeBps: number): number {
  if (!(feeBps > 0)) return 0;
  return Math.floor((amountCents * feeBps) / 10_000);
}

/* ------------------------------------------------------------------------ */
/* Documentos                                                                */
/* ------------------------------------------------------------------------ */

const digits = (value: string) => value.replace(/\D/g, "");

/** CNPJ válido pelos dígitos verificadores (rejeita sequências repetidas). */
export function isValidCnpj(value: string): boolean {
  const d = digits(value);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const check = (len: number) => {
    const weights =
      len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return check(12) === Number(d[12]) && check(13) === Number(d[13]);
}

/**
 * CPF/CNPJ mascarado para guardar e mostrar no painel: só os 4 últimos dígitos à vista
 * ("•••.•••.789-09", "••.•••.•••/0001-91"). O documento completo não é gravado.
 */
export function maskDocument(value: string): string {
  const d = digits(value);
  if (d.length === 11) return `•••.•••.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `••.•••.•••/${d.slice(8, 12)}-${d.slice(12)}`;
  return "•••";
}

/* ------------------------------------------------------------------------ */
/* Cadastro da subconta                                                      */
/* ------------------------------------------------------------------------ */

const text = (max: number, error: string) => z.string({ error }).trim().min(1, { error }).max(max);
const onlyDigits = (min: number, max: number, error: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? digits(v) : v),
    z.string({ error }).min(min, { error }).max(max, { error }),
  );

/** Endereço da subconta (vai só ao provedor; não é gravado). */
export const PaymentAccountAddress = z.object({
  postalCode: onlyDigits(8, 8, "CEP inválido: use os 8 números."),
  street: text(191, "Informe a rua."),
  number: text(20, "Informe o número (ou S/N)."),
  complement: z.string().trim().max(100).optional(),
  /** Bairro (o Asaas chama de `province`). */
  district: text(100, "Informe o bairro."),
});
export type PaymentAccountAddress = z.infer<typeof PaymentAccountAddress>;

/**
 * POST da subconta (organização: `/api/admin/orgs/:orgId/payment-accounts`; a própria pessoa:
 * `/api/admin/events/:eventId/payments/my-account`). Tudo vai ao provedor; gravamos só nome,
 * e-mail, tipo de pessoa/empresa e o documento mascarado. Renda/faturamento mensal em centavos.
 */
export const PaymentAccountInput = z
  .object({
    personType: PaymentAccountPersonType,
    name: text(191, "Informe o nome completo ou a razão social."),
    document: onlyDigits(11, 14, "Informe o CPF (11 números) ou o CNPJ (14 números)."),
    email: z.email({ error: "E-mail inválido." }).trim().toLowerCase().max(191),
    mobilePhone: onlyDigits(10, 11, "Celular inválido: DDD + número."),
    phone: onlyDigits(10, 11, "Telefone inválido: DDD + número.").optional(),
    /** Pessoa física: AAAA-MM-DD. */
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data de nascimento inválida." })
      .optional(),
    /** Pessoa jurídica. */
    companyType: CompanyType.optional(),
    /** Renda mensal (PF) ou faturamento mensal (PJ), em centavos. */
    incomeCents: z
      .number({ error: "Informe a renda ou o faturamento mensal." })
      .int()
      .positive({ error: "Informe a renda ou o faturamento mensal." })
      .max(100_000_000_00),
    address: PaymentAccountAddress,
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (v.personType === "individual") {
      if (v.document.length !== 11 || !isValidCpf(v.document)) issue("document", "CPF inválido.");
      if (!v.birthDate) issue("birthDate", "Informe a data de nascimento.");
    } else {
      if (v.document.length !== 14 || !isValidCnpj(v.document)) issue("document", "CNPJ inválido.");
      if (!v.companyType) issue("companyType", "Escolha o tipo de empresa.");
    }
  });
export type PaymentAccountInput = z.infer<typeof PaymentAccountInput>;

/* ------------------------------------------------------------------------ */
/* Situação cadastral                                                        */
/* ------------------------------------------------------------------------ */

/** Grupo de documentos pedido pelo provedor (Asaas: GET /v3/myAccount/documents). */
export const KycDocumentGroup = z.object({
  id: z.string(),
  /** Tipo do provedor (IDENTIFICATION, SOCIAL_CONTRACT...). */
  type: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: KycDocumentStatus,
  /** Link do provedor para enviar os documentos (vence; ver `onboardingUrlExpiresAt`). */
  onboardingUrl: z.string().nullable(),
  onboardingUrlExpiresAt: z.string().nullable(),
});
export type KycDocumentGroup = z.infer<typeof KycDocumentGroup>;

/**
 * Foto da situação cadastral gravada em `payment_accounts.kyc` (JSON) e devolvida ao painel.
 * Sem nenhum documento em si: só status, títulos e links do provedor.
 */
export const KycSnapshot = z.object({
  general: KycStepStatus,
  commercialInfo: KycStepStatus.nullable(),
  bankAccountInfo: KycStepStatus.nullable(),
  documentation: KycStepStatus.nullable(),
  documents: z.array(KycDocumentGroup).default([]),
  rejectReason: z.string().nullable().default(null),
});
export type KycSnapshot = z.infer<typeof KycSnapshot>;

/* ------------------------------------------------------------------------ */
/* Respostas do painel                                                       */
/* ------------------------------------------------------------------------ */

/** Subconta como o painel vê (nunca apiKey, wallet, token nem documento completo). */
export interface PaymentAccountView {
  id: number;
  holder: PaymentAccountHolder;
  /** Titular quando `holder = user`. */
  user: { id: string; name: string; email: string } | null;
  provider: "simulado" | "asaas";
  personType: PaymentAccountPersonType;
  companyType: CompanyType | null;
  name: string;
  email: string;
  documentHint: string;
  status: PaymentAccountStatus;
  kyc: KycSnapshot | null;
  statusCheckedAt: string | null;
  approvedAt: string | null;
  disabledAt: string | null;
  createdAt: string;
}

/** Resumo para listas e escolhas. */
export type PaymentAccountSummary = Pick<
  PaymentAccountView,
  "id" | "holder" | "user" | "name" | "documentHint" | "status"
>;

/** GET /api/admin/orgs/:orgId/payment-accounts */
export interface OrgPaymentAccountsView {
  /** Conta da organização ativa (não desativada), se houver. */
  organizationAccount: PaymentAccountView | null;
  /** Contas de pessoas da organização (anfitriões, membros), inclusive desativadas. */
  userAccounts: PaymentAccountView[];
  /** Percentual da plataforma (split) aplicado às cobranças. */
  platformFeePercent: number;
  provider: "simulado" | "asaas";
}

/**
 * Situação de recebimento de um evento: `ready` = cobra pela subconta escolhida (aprovada);
 * `platform` = conta principal sem split; `no_account`/`not_approved` = presentes em dinheiro
 * indisponíveis no site até resolver.
 */
export const EVENT_PAYMENT_STATES = ["ready", "platform", "no_account", "not_approved"] as const;
export type EventPaymentState = (typeof EVENT_PAYMENT_STATES)[number];

/** GET /api/admin/events/:eventId/payments */
export interface EventPaymentView {
  receiver: PaymentReceiver;
  /** Conta que receberia agora (org ativa, ou a escolhida do anfitrião), se houver. */
  account: PaymentAccountSummary | null;
  state: EventPaymentState;
  /** Percentual da plataforma; 0 quando `receiver = platform`. */
  platformFeePercent: number;
  /** Contas que podem ser escolhidas (org + pessoas da org que são anfitriãs deste evento). */
  options: PaymentAccountSummary[];
  /** Quem está logado pode trocar o recebedor (`payments.configure`). */
  canConfigure: boolean;
}

/** PUT /api/admin/events/:eventId/payments/receiver */
export const EventReceiverUpdate = z
  .object({
    receiver: PaymentReceiver,
    accountId: z.number().int().positive().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.receiver === "host" && !v.accountId) {
      ctx.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "Escolha a conta do anfitrião.",
      });
    }
  });
export type EventReceiverUpdate = z.infer<typeof EventReceiverUpdate>;

/** GET /api/admin/events/:eventId/payments/my-account */
export interface MyPaymentAccountView {
  account: PaymentAccountView | null;
}

/** Split de um pedido no painel (`AdminOrder.split`, frente C). */
export interface OrderSplitView {
  /** Conta que recebeu (null = conta principal da plataforma). */
  account: PaymentAccountSummary | null;
  /** Percentual da plataforma no momento do pedido (0 sem split). */
  feePercent: number;
  /** Valor da plataforma: o informado pelo provedor ou a estimativa. */
  feeCents: number;
  feeEstimated: boolean;
}
