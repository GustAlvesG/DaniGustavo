import { and, byEvent, eq, giftOrders, sql, type Database } from "@casamento/db";
import { ERROR_CODES, type HealthResponse } from "@casamento/shared";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Auth } from "./auth.ts";
import type { Env } from "./env.ts";
import { apiError, routeNotFound } from "./errors.ts";
import { createMailer, type Mailer } from "./mailer.ts";
import { createAlerter, type Alerter } from "./alerts.ts";
import { describeError, loggerFromEnv, requestLog, type Logger } from "./log.ts";
import { createRateLimiter, type RateLimiter } from "./rate-limit.ts";
import { hostRoutes } from "./routes/hosts.ts";
import { invitationRoutes } from "./routes/invitations.ts";
import { messageRoutes } from "./routes/messages.ts";
import { teamInviteRoutes } from "./routes/team-invites.ts";
import { giftRoutes, orderRoutes, webhookRoutes } from "./routes/orders.ts";
import type { OrderDeps } from "./orders/service.ts";
import { createPaymentProvider, isSimulated, type PaymentProvider } from "./payments/index.ts";
import { loadSiteContent } from "./site-content.ts";
import { createLocalStorage } from "./storage/index.ts";
import { webKey } from "./middleware/web-key.ts";
import { secretBoxFromEnv, type SecretBox } from "./crypto/secret-box.ts";
import { accountWebhookRoutes } from "./routes/account-webhooks.ts";
import { painelRoutes } from "./painel.ts";
import { createSubscriptionProvider, type SubscriptionProvider } from "./billing/index.ts";
import { publicPlanRoutes } from "./routes/plans.ts";
import { subscriptionWebhookRoutes } from "./routes/subscription-webhooks.ts";
import { signupRoutes } from "./routes/signup.ts";
import { privacyRequestRoutes } from "./routes/privacy-requests.ts";
import { requireModule } from "./tenancy/modules.ts";
import { publicEvent } from "./tenancy/public.ts";
import { createEventResolver, type EventResolver } from "./tenancy/resolver.ts";
import type { PublicEventEnv } from "./tenancy/types.ts";
import {
  adminRoutes,
  createWebRevalidator,
  type AdminDeps,
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
  /** Fase 6: logs estruturados (padrão: JSON em produção, texto fora; LOG_FORMAT muda). */
  logger?: Logger;
  /** Fase 6: alertas por e-mail para PLATFORM_ALERT_EMAIL (padrão: pelo mailer, com intervalo). */
  alerts?: Alerter;
  /** Invalida o cache do site depois de uma mudança no painel (padrão: POST no /api/revalidar do Next). */
  revalidate?: Revalidate;
  /** Slug/id/host → evento, com cache em memória (padrão: LRU de 60 s). */
  eventResolver?: EventResolver;
  /** Fase 5: segredos das subcontas (padrão: PAYMENT_SECRETS_KEY do .env). */
  secrets?: SecretBox;
  /** Fase 6: provedor da assinatura das organizações (padrão: BILLING_PROVIDER do .env). */
  billing?: SubscriptionProvider;
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
  logger = loggerFromEnv(env),
  alerts = createAlerter({ env, mailer, logger }),
  revalidate = createWebRevalidator(env),
  eventResolver = createEventResolver(db),
  secrets = secretBoxFromEnv(env),
  billing = createSubscriptionProvider(env),
}: AppDeps) {
  const app = new Hono();

  // Uma linha de log por requisição; 5xx também vira alerta da plataforma (com intervalo).
  app.use(
    "*",
    requestLog(logger, ({ method, path, status, error }) => {
      void alerts.notify({
        key: `http:${status}:${method} ${path}`,
        title: `Erro ${status} em ${method} ${path}`,
        error,
      });
    }),
  );
  // HSTS, nosniff e Referrer-Policy também vêm do snippet `seguranca` do edge em produção;
  // HSTS fica só lá (aqui valeria até em http://localhost).
  app.use(
    "*",
    secureHeaders({
      strictTransportSecurity: false,
      xFrameOptions: "DENY",
      permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: [],
        usb: [],
      },
    }),
  );
  // Respostas da API (JSON, fotos) não carregam nada nem abrem em iframe; o painel define a dele.
  app.use("*", async (c, next) => {
    await next();
    if (!c.res.headers.has("content-security-policy")) {
      c.res.headers.set(
        "Content-Security-Policy",
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      );
    }
  });
  app.use("/api/*", webKey(env.WEB_KEY));

  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  // Saúde. Sem parâmetro: só o processo (healthcheck do Docker e HEALTH_URLS do deploy; não
  // depende do banco nem das migrations). `?db=1`: também `SELECT 1` (503 se o banco falhar),
  // com o resultado guardado por alguns segundos para a rota não virar carga no banco.
  let dbCheck: { at: number; ok: boolean } | null = null;
  app.get("/api/health", async (c) => {
    c.header("Cache-Control", "no-store");
    const wantDb = ["1", "true"].includes(c.req.query("db") ?? "");
    if (!wantDb) return c.json({ status: "ok" } satisfies HealthResponse);
    const t = now().getTime();
    if (!dbCheck || t - dbCheck.at > 5_000) {
      let ok = true;
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          db.execute(sql`select 1`),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("tempo esgotado")), 3_000);
          }),
        ]);
      } catch (err) {
        ok = false;
        logger.error("health: banco indisponível", describeError(err));
      } finally {
        clearTimeout(timer);
      }
      dbCheck = { at: t, ok };
    }
    const body: HealthResponse = dbCheck.ok
      ? { status: "ok", db: "ok" }
      : { status: "error", db: "error" };
    return c.json(body, dbCheck.ok ? 200 : 503);
  });

  app.route("/api/hosts", hostRoutes(eventResolver, db));
  // Fase 6, frente A: planos da página de preços (público).
  app.route("/api/plans", publicPlanRoutes(db));

  const orderDeps: OrderDeps = {
    env,
    db,
    provider,
    mailer,
    now,
    eventResolver,
    revalidate,
    secrets,
  };

  // Rotas públicas de um evento: /api/e/:slug/{site,gifts,messages,invitations,orders}. O
  // evento vem do contexto (publicEvent) e todo serviço filtra por ele.
  const pub = new Hono<PublicEventEnv>();

  pub.get("/site", async (c) => {
    const content = await loadSiteContent(c.get("event"), db);
    c.header("Cache-Control", "public, max-age=60");
    return c.json(content);
  });
  // Módulos desligados no evento (event.modules) → 404 nas rotas públicas do módulo.
  pub.use("/invitations/*", requireModule(db, "rsvp"));
  pub.use("/messages/*", requireModule(db, "messages"));
  pub.use("/gifts/*", requireModule(db, "gifts"));
  pub.on("POST", "/orders", requireModule(db, "gifts"));
  pub.route(
    "/invitations",
    invitationRoutes({ env, db, mailer, limiter: rateLimiter, now, eventResolver }),
  );
  pub.route("/messages", messageRoutes({ db, limiter: rateLimiter }));
  pub.route("/gifts", giftRoutes(orderDeps));
  pub.route("/orders", orderRoutes({ ...orderDeps, limiter: rateLimiter }));
  // Fase 6, frente C: pedidos dos titulares (LGPD) pelo site do evento.
  pub.route("/privacy-requests", privacyRequestRoutes({ db, limiter: rateLimiter, mailer }));

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

  // Global: uma URL por conta do provedor; o evento sai do pedido.
  app.route("/api/webhooks", webhookRoutes(orderDeps));
  // Fase 5: um webhook por subconta (/api/webhooks/payments/accounts/:publicId).
  app.route("/api/webhooks", accountWebhookRoutes(orderDeps));
  // Fase 6, frente A: cobranças da assinatura das organizações.
  app.route("/api/webhooks", subscriptionWebhookRoutes({ env, db, billing, mailer, now }));

  const storage = createLocalStorage(env.UPLOAD_DIR);
  const adminDeps: AdminDeps = {
    ...orderDeps,
    auth,
    limiter: rateLimiter,
    revalidate,
    uploadDir: env.UPLOAD_DIR,
    storage,
  };
  app.route("/api/admin", adminRoutes(adminDeps));
  // Fase 3: aceite de convite da equipe/anfitrião (sem sessão obrigatória; ver o arquivo).
  app.route("/api/team-invites", teamInviteRoutes(adminDeps));
  // Fase 6, frente B: cadastro self-service (fechado com SIGNUP_ENABLED=0).
  app.route("/api/signup", signupRoutes(adminDeps));
  app.route("/", uploadFileRoutes(storage));

  app.route("/", painelRoutes(painelDist));

  app.notFound(routeNotFound);

  // O erro vai para o log (e o alerta) pelo requestLog, que vê o 500 e o `c.error`.
  app.onError((_err, c) => {
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
