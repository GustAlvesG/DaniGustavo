import { eq, webhookEvents } from "@casamento/db";
import {
  CardCheckoutRequest,
  CreateOrderRequest,
  ERROR_CODES,
  PayWithCardRequest,
} from "@casamento/shared";
import { Hono, type Context } from "hono";
import { apiError } from "../errors.ts";
import {
  applyCharge,
  checkOrderCharges,
  createOrder,
  expireOrder,
  findChargeEvent,
  listGifts,
  loadChargeOrder,
  loadOrder,
  orderProvider,
  orderView,
  payWithCard,
  startCardCheckout,
  type Failure,
  type OrderDeps,
} from "../orders/service.ts";
import {
  PaymentProviderError,
  type PaymentProvider,
  type WebhookNotice,
  type WebhookRequest,
} from "../payments/index.ts";
import type { RateLimiter } from "../rate-limit.ts";
import type { PublicEventEnv } from "../tenancy/types.ts";
import { clientIp } from "./invitations.ts";

const MINUTE = 60_000;
/** Intervalo mínimo entre consultas ao provedor para o mesmo pedido (a tela pergunta a cada 3 s). */
export const PROVIDER_CHECK_MS = 15_000;
export const ORDER_LIMIT = 10;

export async function readJson(c: Context): Promise<unknown> {
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

/** GET /api/e/:slug/gifts (o evento vem do contexto, posto por publicEvent). */
export function giftRoutes(deps: OrderDeps) {
  const app = new Hono<PublicEventEnv>();
  app.get("/", async (c) => {
    c.header("Cache-Control", "public, max-age=15");
    const gifts = await listGifts(c.get("event"), deps);
    return c.json({ ...gifts, requiresCpf: !!deps.provider.requiresCpf });
  });
  return app;
}

/** /api/e/:slug/orders: publicId de outro evento → 404. */
export function orderRoutes(deps: OrderDeps & { limiter: RateLimiter }) {
  const { db, limiter, now, provider } = deps;
  const app = new Hono<PublicEventEnv>();
  // Última consulta ao provedor por pedido (memória do processo; some ao reiniciar).
  const lastCheck = new Map<string, number>();

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
    const result = await createOrder(c.get("event"), deps, parsed.data);
    if (!result.ok) return failure(c, result);
    return c.json(result.order, 201);
  });

  app.get("/:publicId", async (c) => {
    c.header("Cache-Control", "no-store");
    const ev = c.get("event");
    const loaded = await loadOrder(ev, db, c.req.param("publicId"));
    if (!loaded) return apiError(c, 404, ERROR_CODES.notFound, "Pedido não encontrado.");
    let { order, gift } = loaded;
    // Vencido e o job ainda não passou: expira agora, para o status não mentir.
    if (order.status === "pending" && now() > order.expiresAt) {
      await expireOrder(ev, deps, order);
      ({ order, gift } = (await loadOrder(ev, db, order.publicId))!);
    } else if (order.status === "pending" && provider.listCharges) {
      // Sem webhook (dev sem túnel, webhook atrasado): confere no provedor de tempos em
      // tempos, assim o Pix e a volta do cartão aparecem pagos mesmo assim.
      const t = now().getTime();
      if (t - (lastCheck.get(order.publicId) ?? 0) >= PROVIDER_CHECK_MS) {
        lastCheck.set(order.publicId, t);
        if (lastCheck.size > 1000) lastCheck.delete(lastCheck.keys().next().value!);
        const checked = await checkOrderCharges(ev, deps, order.publicId).catch(() => null);
        if (checked?.paid) ({ order, gift } = (await loadOrder(ev, db, order.publicId))!);
      }
    }
    return c.json(await orderView(ev, deps, order, gift));
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
    const result = await payWithCard(c.get("event"), deps, c.req.param("publicId"), parsed.data);
    if (!result.ok) return failure(c, result);
    return c.json({ outcome: result.outcome, message: result.message, order: result.order });
  });

  /** Cartão na página do provedor (Asaas): devolve o link da fatura. */
  app.post("/:publicId/card-checkout", async (c) => {
    const blocked = limited(c, limiter, "card");
    if (blocked) return blocked;
    c.header("Cache-Control", "no-store");
    const parsed = CardCheckoutRequest.safeParse((await readJson(c)) ?? {});
    if (!parsed.success) {
      return apiError(c, 422, ERROR_CODES.invalidRequest, "Corpo da requisição inválido.");
    }
    const result = await startCardCheckout(
      c.get("event"),
      deps,
      c.req.param("publicId"),
      parsed.data.coverFee,
    );
    if (!result.ok) return failure(c, result);
    return c.json({ url: result.url });
  });

  return app;
}

/** O que o webhook respondeu (o provedor só olha o status HTTP; o corpo ajuda nos testes). */
export type ChargeNoticeResult =
  | { ok: true; ignored: true }
  | { ok: true; duplicate: true }
  | { ok: true; order: string | null; changedTo: string | null };

/**
 * Aviso de cobrança (webhook global ou de uma subconta), já com o token conferido. Registra o
 * evento (idempotente pelo id do evento), consulta o status na conta que avisou e aplica.
 *
 * - `accountId` null (webhook global, conta principal): pedido de subconta tem o status
 *   consultado de novo na própria subconta (no simulado, o "Simular pagamento aprovado"
 *   avisa sempre pelo global; no Asaas a principal nem enxerga a cobrança da subconta).
 * - `accountId` da subconta: pedido de outra conta (ou da principal) é ignorado.
 */
export async function handleChargeNotice(
  deps: OrderDeps,
  notice: WebhookNotice,
  body: unknown,
  source: { provider: PaymentProvider; accountId: number | null },
): Promise<ChargeNoticeResult> {
  const { db, now } = deps;
  await db
    .insert(webhookEvents)
    .ignore()
    .values({ gateway: source.provider.name, eventId: notice.eventId, payload: body ?? {} });
  const [event] = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.eventId, notice.eventId));
  if (event?.processedAt) return { ok: true, duplicate: true };

  const fetchCharge = async (provider: PaymentProvider) => {
    try {
      return await provider.getCharge(notice.providerOrderId);
    } catch (err) {
      // Cobrança que a conta não conhece (de outra integração, de outra conta, de um teste).
      if (err instanceof PaymentProviderError && err.status === 404) return null;
      throw err;
    }
  };
  let charge = await fetchCharge(source.provider);
  if (!charge) return { ok: true, ignored: true };

  const ev = await findChargeEvent(deps, charge);
  const order = ev ? await loadChargeOrder(ev, db, charge) : null;
  let applied: { order: { publicId: string } | null; changedTo: string | null } = {
    order: null,
    changedTo: null,
  };
  if (ev && order) {
    if (source.accountId === null && order.paymentAccountId !== null) {
      charge = await fetchCharge(await orderProvider(ev, deps, order));
    } else if (source.accountId !== null && order.paymentAccountId !== source.accountId) {
      console.warn(
        `[webhook] Aviso da subconta ${source.accountId} sobre o pedido ${order.publicId}, que é de outra conta: ignorado.`,
      );
      charge = null;
    }
    if (charge) applied = await applyCharge(ev, deps, charge);
  }
  await db
    .update(webhookEvents)
    .set({ processedAt: now(), ...(ev ? { appEventId: ev.id } : {}) })
    .where(eq(webhookEvents.eventId, notice.eventId));
  if (!charge) return { ok: true, ignored: true };
  return { ok: true, order: applied.order?.publicId ?? null, changedTo: applied.changedTo };
}

/**
 * POST /api/webhooks/payments. Confere o token do header `asaas-access-token` (401 se não
 * bater), registra o evento (idempotente pelo id do evento) e consulta o status no
 * provedor: o corpo do aviso nunca é usado como verdade. Processa na própria requisição
 * (milissegundos) e responde 500 em falha para o provedor reenviar.
 *
 * Global (uma URL por conta do provedor): o evento sai do pedido que a cobrança aponta
 * (findChargeEvent) e fica gravado em webhook_events.app_event_id.
 */
export function webhookRoutes(deps: OrderDeps) {
  const { provider } = deps;
  const app = new Hono();

  app.post("/payments", async (c) => {
    const body = await readJson(c);
    const req: WebhookRequest = {
      header: (name) => c.req.header(name),
      query: (name) => c.req.query(name),
      body,
    };
    if (!provider.verifyWebhook(req)) {
      return apiError(c, 401, ERROR_CODES.unauthorized, "Token do webhook inválido.");
    }
    const notice = provider.parseWebhook(req);
    if (!notice) return c.json({ ok: true, ignored: true });
    return c.json(await handleChargeNotice(deps, notice, body, { provider, accountId: null }));
  });

  return app;
}
