import { z } from "zod";
import { Email, EventHost, PASSWORD_MAX, PASSWORD_MIN } from "./org.ts";

/*
 * Fase 6, frente B (docs/saas/fase-6.md): landing e preços no host da plataforma, cadastro
 * self-service com verificação de e-mail, termos/privacidade e domínios dos eventos
 * (`slug.<PLATFORM_BASE_DOMAIN>` automático e domínio próprio verificado por DNS).
 */

/**
 * Versões dos textos legais da plataforma (o aceite grava a versão). Texto em
 * `apps/web/src/app/plataforma/(legal)/`. TODO(conteudo): termos e política revisados.
 */
export const TERMS_VERSION = "2026-11";
export const PRIVACY_POLICY_VERSION = "2026-11";
/** Validade do link de confirmação do cadastro. */
export const SIGNUP_TOKEN_TTL_HOURS = 24;
/** Prefixo do registro TXT de verificação: `_plataforma-verificacao.<domínio>`. */
export const DOMAIN_TXT_PREFIX = "_plataforma-verificacao";

/**
 * POST /api/signup (público; isento de sessão, com X-Web-Key quando vem do site). `website` é
 * o honeypot: preenchido = robô (a API responde 202 igual, sem criar nada). Rate limit por IP e
 * por e-mail. A resposta é sempre a mesma (202), exista ou não conta com o e-mail.
 */
export const SignupInput = z.object({
  name: z.string().trim().min(1, { error: "Informe seu nome." }).max(191),
  email: Email,
  organizationName: z
    .string()
    .trim()
    .min(1, { error: "Informe o nome da organização (ou do casal)." })
    .max(191),
  /** Plano escolhido na página de preços; vazio = o padrão do cadastro (com teste). */
  planCode: z.string().trim().max(32).nullish(),
  acceptTerms: z.literal(true, {
    error: "É preciso aceitar os termos e a política de privacidade.",
  }),
  website: z.string().max(200).optional(),
});
export type SignupInput = z.infer<typeof SignupInput>;

/** GET /api/signup/:token (público): o que o painel mostra antes de pedir a senha. */
export interface SignupPreview {
  name: string;
  /** Mascarado ("an***@exemplo.com"). */
  email: string;
  organizationName: string;
  planName: string;
  expiresAt: string;
}

/** POST /api/signup/:token/confirm: define a senha e cria conta + organização + assinatura. */
export const SignupConfirmInput = z.object({
  password: z
    .string()
    .min(PASSWORD_MIN, { error: `A senha precisa de pelo menos ${PASSWORD_MIN} caracteres.` })
    .max(PASSWORD_MAX),
});
export type SignupConfirmInput = z.infer<typeof SignupConfirmInput>;

export interface SignupConfirmResult {
  email: string;
  organizationId: number;
}

/* ------------------------------------------------------------------------ */
/* Domínios do evento (/api/admin/orgs/:orgId/events/:eventId/domains)       */
/* ------------------------------------------------------------------------ */

export const EVENT_DOMAIN_KINDS = ["platform", "custom"] as const;
export type EventDomainKind = (typeof EVENT_DOMAIN_KINDS)[number];

export interface EventDomainView {
  id: number;
  host: string;
  kind: EventDomainKind;
  isPrimary: boolean;
  verified: boolean;
  /** Para domínio próprio não verificado: o registro que a pessoa cria no DNS. */
  verification: DomainVerification | null;
  lastCheckedAt: string | null;
  /** Por que a última checagem falhou, em pt-BR (null = deu certo ou nunca rodou). */
  checkError: string | null;
}

/** Instruções de DNS do domínio próprio. */
export interface DomainVerification {
  /** Registro TXT: nome `_plataforma-verificacao.<host>` e o valor. */
  txtName: string;
  txtValue: string;
  /** Para onde apontar o domínio (CNAME/A), conforme o deploy (PLATFORM_HOST). */
  target: string | null;
}

/** GET …/domains */
export interface EventDomainsResponse {
  domains: EventDomainView[];
  /** Base dos subdomínios automáticos (null = PLATFORM_BASE_DOMAIN ainda não definido). */
  baseDomain: string | null;
}

/** POST …/domains: domínio próprio (nasce não verificado). */
export const AddEventDomainInput = z.object({ host: EventHost });
export type AddEventDomainInput = z.infer<typeof AddEventDomainInput>;
