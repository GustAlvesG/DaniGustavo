import { eq, giftOrders, type Database } from "@casamento/db";
import { ERROR_CODES } from "@casamento/shared";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Auth } from "./auth.ts";
import type { Env } from "./env.ts";
import { apiError } from "./errors.ts";
import { createMailer, type Mailer } from "./mailer.ts";
import { createRateLimiter, type RateLimiter } from "./rate-limit.ts";
import { invitationRoutes } from "./routes/invitations.ts";
import { giftRoutes, orderRoutes, webhookRoutes } from "./routes/orders.ts";
import type { Notifier } from "./orders/notify.ts";
import type { OrderDeps } from "./orders/service.ts";
import { createPaymentProvider, isSimulated, type PaymentProvider } from "./payments/index.ts";
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
  /** Relógio injetável, para testar o prazo do RSVP e a expiração dos pedidos. */
  now?: () => Date;
  /** Provedor de pagamento (padrão: pelo .env, simulado sem credenciais do Mercado Pago). */
  provider?: PaymentProvider;
  /** Avisos no Telegram (padrão: Bot API, se configurado no .env). */
  notifier?: Notifier;
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
  provider = createPaymentProvider(env),
  notifier,
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

  const orderDeps: OrderDeps = { env, db, provider, mailer, notifier, now };
  app.route("/api/gifts", giftRoutes(orderDeps));
  app.route("/api/orders", orderRoutes({ ...orderDeps, limiter: rateLimiter }));
  app.route("/api/webhooks", webhookRoutes(orderDeps));

  // Só no modo simulado e fora de produção: "Simular pagamento aprovado". Marca o Pix como
  // pago no provedor de mentira e entrega um webhook assinado à rota real, pelo mesmo
  // caminho que o Mercado Pago usaria. Exige X-Web-Key (é uma escrita em /api/*).
  if (isSimulated(provider) && env.NODE_ENV !== "production") {
    app.post("/api/dev/orders/:publicId/approve", async (c) => {
      const [row] = await db
        .select({ providerOrderId: giftOrders.providerOrderId })
        .from(giftOrders)
        .where(eq(giftOrders.publicId, c.req.param("publicId")));
      if (!row?.providerOrderId) {
        return apiError(c, 404, ERROR_CODES.notFound, "Pedido sem Pix simulado.");
      }
      const hook = provider.approve(row.providerOrderId);
      const res = await app.request(hook.path, {
        method: "POST",
        headers: hook.headers,
        body: JSON.stringify(hook.body),
      });
      return c.json({ ok: res.ok, webhookStatus: res.status }, res.ok ? 200 : 502);
    });
  }

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
