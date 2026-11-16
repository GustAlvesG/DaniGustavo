import type { Database } from "@casamento/db";
import { ERROR_CODES } from "@casamento/shared";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Auth } from "./auth.ts";
import type { Env } from "./env.ts";
import { apiError } from "./errors.ts";
import { createMailer, type Mailer } from "./mailer.ts";
import { createRateLimiter, type RateLimiter } from "./rate-limit.ts";
import { invitationRoutes } from "./routes/invitations.ts";
import { buildSiteContent, readPublicSettings } from "./site-content.ts";
import { webKey } from "./middleware/web-key.ts";
import { painelRoutes } from "./painel.ts";

export interface AppDeps {
  env: Env;
  db: Database;
  auth: Auth;
  /** Pasta do build do painel (padrão: dist/painel). */
  painelDist?: string;
  /** Envio de e-mail (padrão: SMTP do .env, ou console se MAIL_HOST estiver vazio). */
  mailer?: Mailer;
  /** Limitador de tentativas (padrão: em memória, por processo). */
  rateLimiter?: RateLimiter;
  /** Relógio injetável, para testar o prazo do RSVP. */
  now?: () => Date;
}

/** Monta a aplicação sem abrir porta: o servidor fica em server.ts e os testes usam app.request(). */
export function createApp({
  env,
  db,
  auth,
  painelDist,
  mailer = createMailer(env),
  rateLimiter = createRateLimiter(),
  now = () => new Date(),
}: AppDeps) {
  const app = new Hono();

  app.use("*", secureHeaders());
  app.use("/api/*", webKey(env.WEB_KEY));

  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.get("/api/health", (c) => c.json({ status: "ok" }));

  app.get("/api/site", async (c) => {
    const content = buildSiteContent(await readPublicSettings(db));
    c.header("Cache-Control", "public, max-age=60");
    return c.json(content);
  });

  app.route("/api/invitations", invitationRoutes({ env, db, mailer, limiter: rateLimiter, now }));

  app.route("/", painelRoutes(painelDist));

  app.notFound((c) =>
    apiError(c, 404, ERROR_CODES.notFound, `Rota ${c.req.method} ${c.req.path} não existe.`),
  );

  app.onError((err, c) => {
    console.error(err);
    return apiError(
      c,
      500,
      ERROR_CODES.internalError,
      "Erro interno na API. Veja o log do servidor para os detalhes.",
    );
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
