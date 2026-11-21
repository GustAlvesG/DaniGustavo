import { SignupConfirmInput, SignupInput } from "@casamento/shared";
import { Hono, type Context } from "hono";
import { invalid, readJson, sameOrigin, type AdminDeps, type AdminEnv } from "../admin/context.ts";
import { apiError, ERROR_CODES, routeNotFound } from "../errors.ts";
import {
  confirmSignup,
  previewSignup,
  requestSignup,
  SIGNUP_NOT_FOUND,
  SignupError,
  type SignupDeps,
} from "../signup/service.ts";
import { clientIp } from "./invitations.ts";

/*
 * Fase 6, frente B (docs/saas/fase-6.md): cadastro self-service, em /api/signup. Fechado com
 * `SIGNUP_ENABLED=0` (404 de rota em todas). Cadastro público do Better Auth continua desligado:
 * a conta é criada aqui, como no aceite de convite (user + account com hash do Better Auth).
 *
 * - POST /                 SignupInput → 202 (sempre a mesma resposta; honeypot `website`;
 *   rate limit por IP e por e-mail; e-mail com o link `#/cadastro/<token>` do painel). Vem do
 *   site (Server Action com X-Web-Key; o IP do visitante chega em X-Client-Ip).
 * - GET  /:token           → SignupPreview (404 se expirado/usado)
 * - POST /:token/confirm   SignupConfirmInput → SignupConfirmResult (cria user com e-mail
 *   verificado, account, organização (dono), assinatura no plano escolhido com teste, aceite dos
 *   termos em legal_acceptances; e-mail que já tem conta → 409 pedindo login). Chamado pelo
 *   painel: `/api/signup/` está nas isenções do X-Web-Key (como /api/team-invites/), por isso
 *   confere a origem e limita por IP.
 */

const MINUTE = 60_000;
/** Pedidos de cadastro por IP a cada 10 minutos (acima: 429). */
export const SIGNUP_IP_LIMIT = 3;
export const SIGNUP_IP_WINDOW_MS = 10 * MINUTE;
/** Pedidos por e-mail por hora (acima: 202 sem enviar nada, para não virar bomba de e-mail). */
export const SIGNUP_EMAIL_LIMIT = 3;
export const SIGNUP_EMAIL_WINDOW_MS = 60 * MINUTE;
/** Consultas e confirmações por IP (o token é inviável de adivinhar; isto corta varredura). */
export const SIGNUP_PREVIEW_LIMIT = 30;
export const SIGNUP_CONFIRM_LIMIT = 10;

const ACCEPTED = {
  ok: true,
  message:
    "Se estiver tudo certo, você vai receber um e-mail com o link para confirmar o cadastro.",
};

/** IP do painel (sem X-Client-Ip): o edge sobrescreve X-Real-IP/X-Forwarded-For. */
function painelIp(c: Context): string {
  const real = c.req.header("x-real-ip")?.trim();
  if (real) return real.slice(0, 45);
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded ? forwarded.slice(0, 45) : clientIp(c);
}

export function signupRoutes(deps: AdminDeps) {
  const { db, limiter, env } = deps;
  const app = new Hono<AdminEnv>();
  const signupDeps: SignupDeps = { db, env, mailer: deps.mailer, now: deps.now };

  app.use("*", async (c, next) => {
    if (!env.SIGNUP_ENABLED) return routeNotFound(c);
    c.header("Cache-Control", "no-store");
    // O token na URL não deve vazar para outros sites por Referer.
    c.header("Referrer-Policy", "no-referrer");
    await next();
  });

  const tooMany = (c: Context, retryAfter: number) =>
    apiError(
      c,
      429,
      ERROR_CODES.tooManyRequests,
      `Muitas tentativas seguidas. Aguarde ${Math.ceil(retryAfter / 60)} minuto(s) e tente de novo.`,
      { "Retry-After": String(retryAfter) },
    );

  app.post("/", async (c) => {
    const ip = clientIp(c);
    const byIp = limiter.hit(`signup:ip:${ip}`, SIGNUP_IP_LIMIT, SIGNUP_IP_WINDOW_MS);
    if (!byIp.allowed) return tooMany(c, byIp.retryAfter);
    const body = await readJson(c);
    // Honeypot preenchido: robô. Mesma resposta, nada gravado nem enviado.
    const honeypot = (body as { website?: unknown } | undefined)?.website;
    if (typeof honeypot === "string" && honeypot.trim() !== "") return c.json(ACCEPTED, 202);
    const parsed = SignupInput.safeParse(body);
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const byEmail = limiter.hit(
      `signup:email:${parsed.data.email}`,
      SIGNUP_EMAIL_LIMIT,
      SIGNUP_EMAIL_WINDOW_MS,
    );
    if (!byEmail.allowed) return c.json(ACCEPTED, 202);
    try {
      await requestSignup(signupDeps, parsed.data, ip);
    } catch (err) {
      console.error("[cadastro] falha ao registrar o pedido ou enviar o e-mail:", err);
      return apiError(
        c,
        502,
        ERROR_CODES.internalError,
        "Não conseguimos enviar o e-mail de confirmação agora. Tente de novo em alguns minutos.",
      );
    }
    return c.json(ACCEPTED, 202);
  });

  const fromPainel = sameOrigin([new URL(env.BETTER_AUTH_URL).origin]);
  app.get("/:token", fromPainel, async (c) => {
    const r = limiter.hit(`signup:preview:${painelIp(c)}`, SIGNUP_PREVIEW_LIMIT, MINUTE);
    if (!r.allowed) return tooMany(c, r.retryAfter);
    const preview = await previewSignup(db, c.req.param("token"), deps.now());
    if (!preview) return apiError(c, 404, ERROR_CODES.notFound, SIGNUP_NOT_FOUND);
    return c.json(preview);
  });
  app.post("/:token/confirm", fromPainel, async (c) => {
    const r = limiter.hit(`signup:confirm:${painelIp(c)}`, SIGNUP_CONFIRM_LIMIT, 10 * MINUTE);
    if (!r.allowed) return tooMany(c, r.retryAfter);
    const parsed = SignupConfirmInput.safeParse((await readJson(c)) ?? {});
    if (!parsed.success) return invalid(c, parsed.error.issues);
    try {
      const result = await confirmSignup(signupDeps, c.req.param("token"), parsed.data.password);
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof SignupError) {
        return apiError(
          c,
          err.status,
          err.status === 409 ? ERROR_CODES.conflict : ERROR_CODES.notFound,
          err.message,
        );
      }
      throw err;
    }
  });
  return app;
}
