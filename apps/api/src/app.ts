import { and, byEvent, eq, giftOrders, type Database } from "@casamento/db";
import { ERROR_CODES } from "@casamento/shared";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Auth } from "./auth.ts";
import type { Env } from "./env.ts";
import { apiError, routeNotFound } from "./errors.ts";
import { createMailer, type Mailer } from "./mailer.ts";
import { createRateLimiter, type RateLimiter } from "./rate-limit.ts";
import { hostRoutes } from "./routes/hosts.ts";
import { invitationRoutes } from "./routes/invitations.ts";
import { messageRoutes } from "./routes/messages.ts";
import { giftRoutes, orderRoutes, webhookRoutes } from "./routes/orders.ts";
import type { Notifier } from "./orders/notify.ts";
import type { OrderDeps } from "./orders/service.ts";
import { createPaymentProvider, isSimulated, type PaymentProvider } from "./payments/index.ts";
import { buildSiteContent, readPublicSettings } from "./site-content.ts";
import { webKey } from "./middleware/web-key.ts";
import { painelRoutes } from "./painel.ts";
import { legacyPublicEvent } from "./tenancy/legacy.ts";
import { publicEvent } from "./tenancy/public.ts";
import { createEventResolver, type EventResolver } from "./tenancy/resolver.ts";
import type { PublicEventEnv } from "./tenancy/types.ts";
import {
  adminRoutes,
  createWebRevalidator,
  uploadFileRoutes,
  type Revalidate,
} from "./admin/index.ts";

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
  /** Provedor de pagamento (padrão: pelo .env, PAYMENT_PROVIDER; simulado se vazio). */
  provider?: PaymentProvider;
  /** Avisos no Telegram (padrão: Bot API, se configurado no .env). */
  notifier?: Notifier;
  /** Invalida o cache do site depois de uma mudança no painel (padrão: POST no /api/revalidar do Next). */
  revalidate?: Revalidate;
  /** Slug/id/host → evento, com cache em memória (padrão: LRU de 60 s). */
  eventResolver?: EventResolver;
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
  revalidate = createWebRevalidator(env),
  eventResolver = createEventResolver(db),
}: AppDeps) {
  const app = new Hono();

  app.use("*", secureHeaders());
  app.use("/api/*", webKey(env.WEB_KEY));

  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.get("/api/health", (c) => c.json({ status: "ok" }));

  app.route("/api/hosts", hostRoutes(eventResolver));

  const orderDeps: OrderDeps = { env, db, provider, mailer, notifier, now, eventResolver };

  // Rotas públicas de um evento: /api/e/:slug/{site,gifts,messages,invitations,orders}. O
  // evento vem do contexto (publicEvent) e todo serviço filtra por ele.
  const pub = new Hono<PublicEventEnv>();

  pub.get("/site", async (c) => {
    const content = buildSiteContent(await readPublicSettings(c.get("event"), db));
    c.header("Cache-Control", "public, max-age=60");
    return c.json(content);
  });
  pub.route("/invitations", invitationRoutes({ env, db, mailer, limiter: rateLimiter, now }));
  pub.route("/messages", messageRoutes({ db, limiter: rateLimiter }));
  pub.route("/gifts", giftRoutes(orderDeps));
  pub.route("/orders", orderRoutes({ ...orderDeps, limiter: rateLimiter }));

  // Só no modo simulado e fora de produção: "Simular pagamento aprovado". Marca o Pix como
  // pago no provedor de mentira e entrega à rota real um webhook no formato do Asaas
  // (token no header asaas-access-token), pelo mesmo caminho do provedor de verdade. Exige X-Web-Key (é uma escrita em /api/*).
  if (isSimulated(provider) && env.NODE_ENV !== "production") {
    pub.post("/dev/orders/:publicId/approve", async (c) => {
      const [row] = await db
        .select({ providerOrderId: giftOrders.providerOrderId })
        .from(giftOrders)
        .where(
          and(
            eq(giftOrders.publicId, c.req.param("publicId")),
            byEvent(giftOrders, c.get("event")),
          ),
        );
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

  app.use("/api/e/:slug/*", publicEvent(eventResolver));
  app.route("/api/e/:slug", pub);

  // Apelido: as rotas antigas (sem slug) respondem como o evento 1, com os mesmos handlers.
  // TODO(fase1-etapa7): sai quando o Next passar a chamar /api/e/:slug.
  const legacy = legacyPublicEvent(eventResolver);
  for (const path of ["site", "invitations", "messages", "gifts", "orders", "dev"]) {
    app.use(`/api/${path}`, legacy);
    app.use(`/api/${path}/*`, legacy);
  }
  app.route("/api", pub);

  // Global: uma URL por conta do provedor; o evento sai do pedido.
  app.route("/api/webhooks", webhookRoutes(orderDeps));

  app.route(
    "/api/admin",
    adminRoutes({
      ...orderDeps,
      auth,
      limiter: rateLimiter,
      revalidate,
      uploadDir: env.UPLOAD_DIR,
    }),
  );
  app.route("/", uploadFileRoutes(env.UPLOAD_DIR));

  app.route("/", painelRoutes(painelDist));

  app.notFound(routeNotFound);

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
