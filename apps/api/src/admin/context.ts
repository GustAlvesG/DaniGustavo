import type { Database } from "@casamento/db";
import type { Context, MiddlewareHandler } from "hono";
import type { Auth } from "../auth.ts";
import type { Env } from "../env.ts";
import { apiError, ERROR_CODES } from "../errors.ts";
import type { OrderDeps } from "../orders/service.ts";
import type { RateLimiter } from "../rate-limit.ts";
import type { Revalidate } from "./revalidate.ts";

/** Dependências das rotas do painel (/api/admin/*). */
export interface AdminDeps extends OrderDeps {
  env: Env;
  db: Database;
  auth: Auth;
  limiter: RateLimiter;
  revalidate: Revalidate;
  /** Pasta onde ficam as imagens enviadas pelo painel. */
  uploadDir: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
}

export type AdminEnv = { Variables: { user: AdminUser } };

/**
 * Exige sessão do Better Auth (cookie). Equivale ao middleware `auth` do Laravel: sem
 * sessão, 401 e o painel volta para o login. O painel nunca usa X-Web-Key.
 */
export function requireSession(auth: Auth): MiddlewareHandler<AdminEnv> {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return apiError(
        c,
        401,
        ERROR_CODES.unauthorized,
        "Sua sessão expirou. Entre de novo no painel.",
      );
    }
    c.set("user", { id: session.user.id, name: session.user.name, email: session.user.email });
    c.header("Cache-Control", "no-store");
    await next();
  };
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Proteção CSRF (o papel do VerifyCsrfToken do Laravel): navegadores sempre mandam Origin
 * em escritas de outra origem; se vier e não for a do painel, 403. Sem Origin e sem
 * Sec-Fetch-Site não é navegador (curl, testes), então não há cookie para roubar.
 */
export function sameOrigin(allowed: string[]): MiddlewareHandler<AdminEnv> {
  return async (c, next) => {
    if (!SAFE.has(c.req.method)) {
      const origin = c.req.header("origin");
      const site = c.req.header("sec-fetch-site");
      const bad = origin ? !allowed.includes(origin) : site !== undefined && site !== "same-origin";
      if (bad) {
        return apiError(
          c,
          403,
          ERROR_CODES.unauthorized,
          "Pedido de outra origem recusado. Use o painel em /painel.",
        );
      }
    }
    await next();
  };
}

const MINUTE = 60_000;
/** Ações sensíveis do painel (reembolso, conciliação, upload, novo link): por usuário. */
export const ADMIN_SENSITIVE_LIMIT = 20;

export function sensitiveLimit(limiter: RateLimiter, bucket: string): MiddlewareHandler<AdminEnv> {
  return async (c, next) => {
    const r = limiter.hit(`admin:${bucket}:${c.get("user").id}`, ADMIN_SENSITIVE_LIMIT, MINUTE);
    if (!r.allowed) {
      return apiError(
        c,
        429,
        ERROR_CODES.tooManyRequests,
        `Muitas ações seguidas. Aguarde ${r.retryAfter} segundos e tente de novo.`,
        { "Retry-After": String(r.retryAfter) },
      );
    }
    await next();
  };
}

export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/** Converte o primeiro erro do zod em 422 com mensagem em pt-BR. */
export function invalid(c: Context, issues: { message: string }[]) {
  return apiError(
    c,
    422,
    ERROR_CODES.invalidRequest,
    issues[0]?.message ?? "Dados inválidos. Confira o formulário.",
  );
}

export const notFound = (c: Context, what: string) =>
  apiError(c, 404, ERROR_CODES.notFound, `${what} não encontrado.`);

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
