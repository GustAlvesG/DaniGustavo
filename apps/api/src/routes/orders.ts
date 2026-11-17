import { eq, webhookEvents } from "@casamento/db";
import { CreateOrderRequest, ERROR_CODES, PayWithCardRequest } from "@casamento/shared";
import { Hono, type Context } from "hono";
import { apiError } from "../errors.ts";
import {
  applyCharge,
  createOrder,
  expireOrder,
  listGifts,
  loadOrder,
  orderView,
  payWithCard,
  type Failure,
  type OrderDeps,
} from "../orders/service.ts";
import { PaymentProviderError, type WebhookRequest } from "../payments/index.ts";
import type { RateLimiter } from "../rate-limit.ts";
import { clientIp } from "./invitations.ts";

const MINUTE = 60_000;
export const ORDER_LIMIT = 10;

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

const failure = (c: Context, f: Failure) => apiError(c, f.status, f.code, f.message);

function limited(c: Context, limiter: RateLimiter, bucket: string) {
  const limit = limiter.hit(`${bucket}:${clientIp(c)}`, ORDER_LIMIT, MINUTE);
  if (limit.allowed) return null;
  return apiError(
    c,
    429,
    ERROR_CODES.tooManyRequests,
    `Muitas tentativas em pouco tempo. Aguarde ${limit.retryAfter} segundos e tente de novo.`,
    { "Retry-After": String(limit.retryAfter) },
  );
}

/** GET /api/gifts */
export function giftRoutes(deps: OrderDeps) {
  const app = new Hono();
  app.get("/", async (c) => {
    c.header("Cache-Control", "public, max-age=15");
    return c.json(await listGifts(deps.db));
  });
  return app;
}

/** /api/orders */
export function orderRoutes(deps: OrderDeps & { limiter: RateLimiter }) {
  const { db, limiter, now } = deps;
  const app = new Hono();

  app.post("/", async (c) => {
    const blocked = limited(c, limiter, "orders");
    if (blocked) return blocked;
    c.header("Cache-Control", "no-store");

    const body = await readJson(c);
    const trap = (body as { website?: unknown } | undefined)?.website;
    if (typeof trap === "string" && trap.trim() !== "") {
      // Honeypot: robô recebe um erro genérico e nada é reservado.
      return apiError(c, 422, ERROR_CODES.invalidRequest, "Não foi possível criar o pedido.");
    }
    const parsed = CreateOrderRequest.safeParse(body);
    if (!parsed.success) {
      return apiError(
        c,
        422,
        ERROR_CODES.invalidRequest,
        parsed.error.issues[0]?.message ?? "Corpo da requisição inválido.",
      );
    }
    const result = await createOrder(deps, parsed.data);
    if (!result.ok) return failure(c, result);
    return c.json(result.order, 201);
  });

  app.get("/:publicId", async (c) => {
    c.header("Cache-Control", "no-store");
    const loaded = await loadOrder(db, c.req.param("publicId"));
    if (!loaded) return apiError(c, 404, ERROR_CODES.notFound, "Pedido não encontrado.");
    let { order, gift } = loaded;
    // Vencido e o job ainda não passou: expira agora, para o status não mentir.
    if (order.status === "pending" && now() > order.expiresAt) {
      await expireOrder(deps, order);
      ({ order, gift } = (await loadOrder(db, order.publicId))!);
    }
    return c.json(await orderView(deps, order, gift));
  });

  app.post("/:publicId/card", async (c) => {
    const blocked = limited(c, limiter, "card");
    if (blocked) return blocked;
    c.header("Cache-Control", "no-store");
    const parsed = PayWithCardRequest.safeParse(await readJson(c));
    if (!parsed.success) {
      return apiError(
        c,
        422,
        ERROR_CODES.invalidRequest,
        parsed.error.issues[0]?.message ?? "Dados do cartão inválidos.",
      );
    }
    const result = await payWithCard(deps, c.req.param("publicId"), parsed.data);
    if (!result.ok) return failure(c, result);
    return c.json({ outcome: result.outcome, message: result.message, order: result.order });
  });

  return app;
}

/**
 * POST /api/webhooks/payments. Valida a assinatura (401 se inválida), registra o evento
 * (idempotente por event_id) e consulta o status no provedor: o corpo do aviso nunca é
 * usado como verdade. Processa na própria requisição (leva milissegundos; o Mercado Pago
 * espera até 22 s) e responde 500 em falha para o provedor reenviar.
 */
export function webhookRoutes(deps: OrderDeps) {
  const { db, provider, now } = deps;
  const app = new Hono();

  app.post("/payments", async (c) => {
    const body = await readJson(c);
    const req: WebhookRequest = {
      header: (name) => c.req.header(name),
      query: (name) => c.req.query(name),
      body,
    };
    if (!provider.verifyWebhook(req)) {
      return apiError(c, 401, ERROR_CODES.unauthorized, "Assinatura do webhook inválida.");
    }
    const notice = provider.parseWebhook(req);
    if (!notice) return c.json({ ok: true, ignored: true });

    await db
      .insert(webhookEvents)
      .ignore()
      .values({ gateway: provider.name, eventId: notice.eventId, payload: body ?? {} });
    const [event] = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.eventId, notice.eventId));
    if (event?.processedAt) return c.json({ ok: true, duplicate: true });

    let charge;
    try {
      charge = await provider.getCharge(notice.providerOrderId);
    } catch (err) {
      // Cobrança que não existe (ex.: o teste de notificação do painel do Mercado Pago).
      if (err instanceof PaymentProviderError && err.status === 404) {
        return c.json({ ok: true, ignored: true });
      }
      throw err;
    }
    const { order, changedTo } = await applyCharge(deps, charge);
    await db
      .update(webhookEvents)
      .set({ processedAt: now() })
      .where(eq(webhookEvents.eventId, notice.eventId));
    return c.json({ ok: true, order: order?.publicId ?? null, changedTo });
  });

  return app;
}
