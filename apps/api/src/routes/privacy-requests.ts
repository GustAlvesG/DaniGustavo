import { privacyRequests, type Database } from "@casamento/db";
import {
  ERROR_CODES,
  PRIVACY_NOTICE_VERSION,
  PrivacyRequestInput,
  type PrivacyNotice,
} from "@casamento/shared";
import { Hono } from "hono";
import { readSetting } from "../admin/event-settings.ts";
import { apiError } from "../errors.ts";
import type { Mailer } from "../mailer.ts";
import { eventNotifyRecipients } from "../orders/notify.ts";
import { buildPrivacyRequestTeamEmail } from "../privacy-email.ts";
import { hashIp, loadPrivacySettings } from "../privacy/settings.ts";
import type { RateLimiter } from "../rate-limit.ts";
import type { EventCtx, PublicEventEnv } from "../tenancy/types.ts";
import { clientIp } from "./invitations.ts";

/** Pedidos de titular por IP: 3 a cada 10 minutos. */
export const PRIVACY_REQUEST_LIMIT = 3;
export const PRIVACY_REQUEST_WINDOW_MS = 10 * 60_000;

/** Aviso público do evento: versão, se exige aceite, contato e prazo de retenção. */
export async function loadPrivacyNotice(ev: EventCtx, db: Database): Promise<PrivacyNotice> {
  const settings = await loadPrivacySettings(ev, db);
  let contactEmail = settings.contactEmail;
  if (!contactEmail) {
    const contact = (await readSetting(ev, db, "couple.contact")) as
      { email?: unknown } | undefined;
    contactEmail = typeof contact?.email === "string" && contact.email ? contact.email : null;
  }
  return {
    version: PRIVACY_NOTICE_VERSION,
    requireConsent: settings.requireConsent,
    contactEmail,
    retentionDays: settings.retentionDays,
    eventName: ev.name,
  };
}

/*
 * Fase 6, frente C, em /api/e/:slug/privacy-requests:
 * - GET /notice: o aviso de privacidade do evento (página /privacidade, RSVP e mural).
 * - POST /: PrivacyRequestInput → 202 (com X-Web-Key, vindo do site). Honeypot `website`, 3 por
 *   10 min por IP (só o hash do IP é gravado); avisa a equipe do evento por e-mail.
 */
export function privacyRequestRoutes(deps: { db: Database; limiter: RateLimiter; mailer: Mailer }) {
  const { db, limiter, mailer } = deps;
  const app = new Hono<PublicEventEnv>();

  app.get("/notice", async (c) => {
    c.header("Cache-Control", "public, max-age=60");
    return c.json(await loadPrivacyNotice(c.get("event"), db));
  });

  app.post("/", async (c) => {
    c.header("Cache-Control", "no-store");
    const ip = clientIp(c);
    const limit = limiter.hit(`privacy:${ip}`, PRIVACY_REQUEST_LIMIT, PRIVACY_REQUEST_WINDOW_MS);
    if (!limit.allowed) {
      return apiError(
        c,
        429,
        ERROR_CODES.tooManyRequests,
        `Você já enviou alguns pedidos agora há pouco. Aguarde uns ${Math.ceil(limit.retryAfter / 60)} minutos e tente de novo.`,
        { "Retry-After": String(limit.retryAfter) },
      );
    }
    const raw: unknown = await c.req.json().catch(() => undefined);
    const trap = (raw as { website?: unknown } | undefined)?.website;
    // Honeypot: o robô recebe o mesmo 202 e nada é gravado.
    if (typeof trap === "string" && trap.trim() !== "") return c.json({ ok: true }, 202);
    const parsed = PrivacyRequestInput.safeParse(raw);
    if (!parsed.success) {
      return apiError(
        c,
        422,
        ERROR_CODES.invalidRequest,
        parsed.error.issues[0]?.message ?? "Pedido inválido. Confira os campos.",
      );
    }
    const ev = c.get("event");
    const { kind, name, email, message } = parsed.data;
    await db.insert(privacyRequests).values({
      eventId: ev.id,
      kind,
      name,
      email,
      message: message || null,
      ipHash: hashIp(ip),
    });
    // Sem await: quem pediu não espera o SMTP. Falha de envio só vai para o log.
    void (async () => {
      for (const to of await eventNotifyRecipients(ev, db)) {
        await mailer.send(buildPrivacyRequestTeamEmail({ to, eventName: ev.name, kind, name }));
      }
    })().catch((err: unknown) => {
      console.error("[privacidade] Falha ao avisar a equipe do pedido:", err);
    });
    return c.json({ ok: true }, 202);
  });

  return app;
}
