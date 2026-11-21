import { EventReceiverUpdate, PaymentAccountInput } from "@casamento/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { errorBody } from "../errors.ts";
import { activeUserAccount } from "../payment-accounts/store.ts";
import {
  createPaymentAccount,
  eventPaymentView,
  PaymentAccountError,
  paymentAccountView,
  setEventReceiver,
} from "../payment-accounts/service.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import type { EventAdminEnv } from "../tenancy/types.ts";
import { invalid, readJson, sensitiveLimit } from "./context.ts";
import type { AdminDeps } from "./context.ts";

/*
 * Fase 5, frente C (docs/saas/fase-5.md): recebimento do evento, em
 * /api/admin/events/:eventId/payments.
 *
 * - GET  /             → EventPaymentView                       (payments.read)
 * - PUT  /receiver     EventReceiverUpdate → EventPaymentView   (payments.configure; nunca o
 *   anfitrião; `platform` só o platform admin, 403 para os outros; conta de outra
 *   organização/desativada → 422)
 * - GET  /my-account   → MyPaymentAccountView                   (payments.own_account)
 * - POST /my-account   PaymentAccountInput → { account: PaymentAccountView }
 *   (payments.own_account; já tem conta ativa → 409; rate limit sensitiveLimit)
 * A frente D monta POST /my-account/refresh no mesmo prefixo (admin/payment-account-status.ts).
 */

/** Roda a ação e transforma PaymentAccountError na resposta de erro padrão. */
export async function handlePaymentErrors(c: Context, fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PaymentAccountError) {
      return c.json(errorBody(err.code, err.message, err.field), err.status);
    }
    throw err;
  }
}

export function adminPaymentRoutes(deps: AdminDeps) {
  const { db } = deps;
  const app = new Hono<EventAdminEnv>();
  const canConfigure = (role: string) => role !== "event_host";

  app.get("/", requirePermission("payments.read"), async (c) =>
    c.json(await eventPaymentView(deps, c.get("event"), canConfigure(c.get("eventRole")))),
  );

  app.put("/receiver", requirePermission("payments.configure"), (c) =>
    handlePaymentErrors(c, async () => {
      const parsed = EventReceiverUpdate.safeParse(await readJson(c));
      if (!parsed.success) return invalid(c, parsed.error.issues);
      const ev = c.get("event");
      await setEventReceiver(deps, ev, parsed.data, c.get("eventRole") === "platform_admin");
      await deps.revalidate(ev.id, ["gifts"]);
      return c.json(await eventPaymentView(deps, ev, true));
    }),
  );

  app.get("/my-account", requirePermission("payments.own_account"), async (c) => {
    const row = await activeUserAccount(db, c.get("event").orgId, c.get("user").id);
    return c.json({ account: row ? await paymentAccountView(db, row) : null });
  });

  app.post(
    "/my-account",
    requirePermission("payments.own_account"),
    sensitiveLimit(deps.limiter, "payment-account"),
    (c) =>
      handlePaymentErrors(c, async () => {
        const parsed = PaymentAccountInput.safeParse(await readJson(c));
        if (!parsed.success) return invalid(c, parsed.error.issues);
        const ev = c.get("event");
        const u = c.get("user");
        const row = await createPaymentAccount(deps, {
          orgId: ev.orgId,
          holder: "user",
          userId: u.id,
          createdBy: u.id,
          input: parsed.data,
        });
        return c.json({ account: await paymentAccountView(db, row) }, 201);
      }),
  );
  return app;
}
