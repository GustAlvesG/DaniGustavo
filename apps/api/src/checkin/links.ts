import { and, byEvent, checkinLinks, eq, type Database } from "@casamento/db";
import {
  CHECKIN_PIN_LOCK_MINUTES,
  CHECKIN_PIN_MAX_FAILURES,
  CHECKIN_SESSION_HOURS,
  type CheckinLinkCreated,
  type CheckinLinkInput,
  type CheckinLinkView,
} from "@casamento/shared";
import { crossEvent } from "../tenancy/cross-event.ts";
import type { EventCtx } from "../tenancy/types.ts";
import {
  hashLinkToken,
  hashPin,
  isLinkTokenShape,
  newLinkToken,
  newPin,
  readSession,
  signSession,
  verifyPin,
} from "./crypto.ts";
import { findLink, linkStatus, linkView } from "./service.ts";

/*
 * Fase 7, frente A: links da portaria (gerar, revogar) e a troca link + PIN → sessão.
 */

const HOUR = 3_600_000;
const MINUTE = 60_000;

/** URL da portaria no host da API; o token vai no fragmento (não chega ao servidor nem ao log). */
export const portariaUrl = (apiUrl: string, token: string) =>
  `${apiUrl.replace(/\/+$/, "")}/portaria/#${token}`;

export async function createLink(
  ev: EventCtx,
  db: Database,
  input: CheckinLinkInput,
  createdBy: string,
  apiUrl: string,
  now: Date,
): Promise<CheckinLinkCreated> {
  const token = newLinkToken();
  const pin = newPin();
  const [res] = await db.insert(checkinLinks).values({
    eventId: ev.id,
    label: input.label,
    tokenHash: hashLinkToken(token),
    pinHash: await hashPin(pin),
    expiresAt: new Date(now.getTime() + input.hours * HOUR),
    createdBy,
    createdAt: now,
    updatedAt: now,
  });
  const link = await findLink(ev, db, res.insertId);
  return { link: linkView(link!, now), url: portariaUrl(apiUrl, token), pin };
}

/** Revoga (idempotente). null = link de outro evento ou inexistente. */
export async function revokeLink(
  ev: EventCtx,
  db: Database,
  id: number,
  now: Date,
): Promise<CheckinLinkView | null> {
  const link = await findLink(ev, db, id);
  if (!link) return null;
  if (!link.revokedAt) {
    await db
      .update(checkinLinks)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(byEvent(checkinLinks, ev), eq(checkinLinks.id, id)));
  }
  return linkView((await findLink(ev, db, id))!, now);
}

/* ------------------------------ portaria ------------------------------ */

export interface OpenedSession {
  session: string;
  expiresAt: Date;
  eventId: number;
  linkLabel: string;
}

/**
 * Link + PIN → sessão. null para tudo o que falha (token inválido, expirado, revogado,
 * bloqueado, PIN errado): a rota responde o mesmo 401. PIN errado conta no link e, depois de
 * CHECKIN_PIN_MAX_FAILURES, bloqueia por CHECKIN_PIN_LOCK_MINUTES.
 */
export async function openSession(
  db: Database,
  secret: string,
  token: string,
  pin: string,
  now: Date,
): Promise<OpenedSession | null> {
  const found = isLinkTokenShape(token)
    ? await crossEvent("portaria: link achado pelo hash do token", async () => {
        const [row] = await db
          .select()
          .from(checkinLinks)
          .where(eq(checkinLinks.tokenHash, hashLinkToken(token)));
        return row ?? null;
      })
    : null;
  // Sem link, o scrypt roda do mesmo jeito (tempo parecido para token bom e ruim).
  const pinOk = await verifyPin(pin, found?.pinHash ?? null);
  if (!found) return null;
  const scope = { id: found.eventId };

  return db.transaction(async (tx) => {
    const [link] = await tx
      .select()
      .from(checkinLinks)
      .where(and(byEvent(checkinLinks, scope), eq(checkinLinks.id, found.id)))
      .for("update");
    if (!link || linkStatus(link, now) !== "active") return null;
    if (link.lockedUntil && link.lockedUntil.getTime() > now.getTime()) return null;
    const where = and(byEvent(checkinLinks, scope), eq(checkinLinks.id, link.id));
    if (!pinOk) {
      const failures = link.pinFailures + 1;
      const lock = failures >= CHECKIN_PIN_MAX_FAILURES;
      await tx
        .update(checkinLinks)
        .set({
          pinFailures: lock ? 0 : failures,
          lockedUntil: lock ? new Date(now.getTime() + CHECKIN_PIN_LOCK_MINUTES * MINUTE) : null,
          updatedAt: now,
        })
        .where(where);
      return null;
    }
    await tx
      .update(checkinLinks)
      .set({ pinFailures: 0, lockedUntil: null, lastUsedAt: now, updatedAt: now })
      .where(where);
    const expiresAt = new Date(
      Math.min(now.getTime() + CHECKIN_SESSION_HOURS * HOUR, link.expiresAt.getTime()),
    );
    return {
      session: signSession(secret, { eventId: link.eventId, linkId: link.id, expiresAt }),
      expiresAt,
      eventId: link.eventId,
      linkLabel: link.label,
    };
  });
}

/** Sessão da portaria válida: assinatura, prazo e link ainda ativo no banco. */
export async function checkSession(
  db: Database,
  secret: string,
  bearer: string,
  now: Date,
): Promise<{ eventId: number; linkId: number; label: string } | null> {
  const claims = readSession(secret, bearer, now);
  if (!claims) return null;
  const [link] = await db
    .select()
    .from(checkinLinks)
    .where(and(byEvent(checkinLinks, { id: claims.eventId }), eq(checkinLinks.id, claims.linkId)));
  if (!link || linkStatus(link, now) !== "active") return null;
  return { eventId: link.eventId, linkId: link.id, label: link.label };
}
