import { createHmac } from "node:crypto";
import {
  account,
  and,
  COURTESY_PLAN_CODE,
  DEFAULT_SIGNUP_PLAN_CODE,
  ensureOrgSubscription,
  eq,
  gt,
  isNull,
  isUniqueViolation,
  legalAcceptances,
  organizationMembers,
  organizations,
  plans,
  signupRequests,
  user,
  type Database,
} from "@casamento/db";
import {
  PRIVACY_POLICY_VERSION,
  SIGNUP_TOKEN_TTL_HOURS,
  SLUG_PATTERN,
  TERMS_VERSION,
  type SignupConfirmResult,
  type SignupInput,
  type SignupPreview,
} from "@casamento/shared";
import { hashPassword } from "better-auth/crypto";
import { ulid } from "ulid";
import type { Env } from "../env.ts";
import type { Mailer } from "../mailer.ts";
import {
  buildSignupEmail,
  buildSignupExistingEmail,
  painelLink,
  signupLink,
} from "../signup-email.ts";
import {
  hashInviteToken,
  isInviteTokenShape,
  maskEmail,
  newInviteToken,
} from "../team-invites/token.ts";

/*
 * Fase 6, frente B (docs/saas/fase-6.md §3 "Cadastro"): cadastro self-service.
 * 1. `requestSignup`: grava o pedido em `signup_requests` (token só em SHA-256, validade de
 *    SIGNUP_TOKEN_TTL_HOURS, versões dos termos aceitos) e manda o link do painel por e-mail.
 *    Nenhuma senha aqui: credencial só depois de o e-mail ser provado. E-mail que já tem conta
 *    recebe um lembrete de login (a resposta HTTP é a mesma, não revela nada).
 * 2. `confirmSignup`: uso único (UPDATE condicional), cria `user` (e-mail verificado) + `account`
 *    "credential" como o aceite de convite, a organização com a pessoa como dona, a assinatura
 *    no plano escolhido (`ensureOrgSubscription`, com teste) e o aceite em `legal_acceptances`.
 * `signup_requests` e `legal_acceptances` são tabelas da plataforma (PLATFORM_TABLES no auditor).
 */

export class SignupError extends Error {
  readonly status: 404 | 409;
  constructor(status: SignupError["status"], message: string) {
    super(message);
    this.status = status;
  }
}

/** A mesma resposta para token inválido, expirado ou já usado. */
export const SIGNUP_NOT_FOUND =
  "Este link de confirmação não vale mais (expirou ou já foi usado). Faça o cadastro de novo.";
export const SIGNUP_ACCOUNT_EXISTS =
  "Já existe uma conta com este e-mail. Entre pelo painel com a sua senha.";

export interface SignupDeps {
  db: Database;
  env: Pick<Env, "BETTER_AUTH_URL" | "BETTER_AUTH_SECRET">;
  mailer: Mailer;
  now: () => Date;
}

const HOUR = 3_600_000;

/** HMAC do IP com o segredo da API: serve para auditoria sem guardar o IP em claro. */
export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(`ip:${ip}`).digest("hex");
}

async function userExists(db: Database, email: string): Promise<boolean> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return row !== undefined;
}

/** Plano do cadastro: o escolhido, se for público e ativo; senão o padrão. */
async function signupPlan(db: Database, code: string | null | undefined) {
  const pick = async (c: string) =>
    (
      await db
        .select({ code: plans.code, name: plans.name, public: plans.public, active: plans.active })
        .from(plans)
        .where(eq(plans.code, c))
    )[0];
  if (code && code !== COURTESY_PLAN_CODE) {
    const chosen = await pick(code);
    if (chosen?.public && chosen.active) return chosen;
  }
  return (await pick(DEFAULT_SIGNUP_PLAN_CODE)) ?? null;
}

/**
 * Grava o pedido e manda o e-mail. Pedidos anteriores do mesmo e-mail ainda abertos expiram
 * (só o link mais novo vale). Falha no envio do e-mail sobe (a rota responde 502).
 */
export async function requestSignup(
  deps: SignupDeps,
  input: SignupInput,
  ip: string,
): Promise<void> {
  const { db, env } = deps;
  const now = deps.now();
  if (await userExists(db, input.email)) {
    await deps.mailer.send(
      buildSignupExistingEmail({ to: input.email, loginUrl: painelLink(env.BETTER_AUTH_URL) }),
    );
    return;
  }
  const plan = await signupPlan(db, input.planCode);
  const token = newInviteToken();
  await db
    .update(signupRequests)
    .set({ expiresAt: now })
    .where(
      and(
        eq(signupRequests.email, input.email),
        isNull(signupRequests.confirmedAt),
        gt(signupRequests.expiresAt, now),
      ),
    );
  await db.insert(signupRequests).values({
    email: input.email,
    name: input.name,
    organizationName: input.organizationName,
    planCode: plan?.code ?? null,
    tokenHash: hashInviteToken(token),
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_POLICY_VERSION,
    ipHash: hashIp(ip, env.BETTER_AUTH_SECRET),
    expiresAt: new Date(now.getTime() + SIGNUP_TOKEN_TTL_HOURS * HOUR),
  });
  await deps.mailer.send(
    buildSignupEmail({
      to: input.email,
      name: input.name,
      organizationName: input.organizationName,
      link: signupLink(env.BETTER_AUTH_URL, token),
    }),
  );
}

/** Pedido em aberto pelo token (não confirmado e no prazo), ou null. */
async function findOpenRequest(db: Database, token: string, now: Date) {
  if (!isInviteTokenShape(token)) return null;
  const [row] = await db
    .select()
    .from(signupRequests)
    .where(eq(signupRequests.tokenHash, hashInviteToken(token)));
  if (!row || row.confirmedAt || row.expiresAt.getTime() <= now.getTime()) return null;
  return row;
}

export async function previewSignup(
  db: Database,
  token: string,
  now: Date,
): Promise<SignupPreview | null> {
  const row = await findOpenRequest(db, token, now);
  if (!row) return null;
  const plan = await signupPlan(db, row.planCode);
  return {
    name: row.name,
    email: maskEmail(row.email),
    organizationName: row.organizationName,
    planName: plan?.name ?? "Plano padrão",
    expiresAt: row.expiresAt.toISOString(),
  };
}

/** "Ana & Bruno Eventos" → "ana-bruno-eventos" (o padrão de slug da plataforma). */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return SLUG_PATTERN.test(slug) ? slug : "organizacao";
}

async function freeOrgSlug(db: Database, name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 6; i++) {
    const slug = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 7)}`;
    const [row] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug));
    if (!row) return slug;
  }
  return `${base}-${ulid().slice(-8).toLowerCase()}`;
}

/** Define a senha e cria conta + organização + assinatura + aceites. */
export async function confirmSignup(
  deps: SignupDeps,
  token: string,
  password: string,
): Promise<SignupConfirmResult> {
  const { db } = deps;
  const now = deps.now();
  const request = await findOpenRequest(db, token, now);
  if (!request) throw new SignupError(404, SIGNUP_NOT_FOUND);
  if (await userExists(db, request.email)) throw new SignupError(409, SIGNUP_ACCOUNT_EXISTS);

  const passwordHash = await hashPassword(password);
  const plan = await signupPlan(db, request.planCode);
  const slug = await freeOrgSlug(db, request.organizationName);
  const userId = ulid();

  try {
    const organizationId = await db.transaction(async (tx) => {
      const [used] = await tx
        .update(signupRequests)
        .set({ confirmedAt: now })
        .where(
          and(
            eq(signupRequests.id, request.id),
            isNull(signupRequests.confirmedAt),
            gt(signupRequests.expiresAt, now),
          ),
        );
      if (used.affectedRows !== 1) throw new SignupError(404, SIGNUP_NOT_FOUND);

      await tx.insert(user).values({
        id: userId,
        name: request.name,
        email: request.email,
        emailVerified: true,
      });
      await tx.insert(account).values({
        id: ulid(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
      });
      const [org] = await tx.insert(organizations).values({ slug, name: request.organizationName });
      const orgId = org.insertId;
      await tx.insert(organizationMembers).values({ organizationId: orgId, userId, role: "owner" });
      // O aceite aconteceu no formulário (quando o pedido foi feito), com as versões de então.
      await tx.insert(legalAcceptances).values([
        {
          userId,
          document: "terms",
          version: request.termsVersion,
          acceptedAt: request.createdAt,
          ipHash: request.ipHash,
        },
        {
          userId,
          document: "privacy",
          version: request.privacyVersion,
          acceptedAt: request.createdAt,
          ipHash: request.ipHash,
        },
      ]);
      await tx
        .update(signupRequests)
        .set({ userId, organizationId: orgId })
        .where(eq(signupRequests.id, request.id));
      // Mesma API do Database (select/insert); a transação garante tudo ou nada.
      if (plan) await ensureOrgSubscription(tx as unknown as Database, orgId, plan.code);
      return orgId;
    });
    return { email: request.email, organizationId };
  } catch (err) {
    // Conta criada com o mesmo e-mail no meio do caminho (convite aceito, clique duplo).
    if (isUniqueViolation(err) && (await userExists(db, request.email))) {
      throw new SignupError(409, SIGNUP_ACCOUNT_EXISTS);
    }
    throw err;
  }
}
