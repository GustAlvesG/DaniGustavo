import { createHash, randomBytes } from "node:crypto";
import {
  and,
  byEvent,
  desc,
  eq,
  eventVendors,
  vendorPortalLinks,
  vendors,
  type Database,
} from "@casamento/db";
import type { VendorPortalLinkInput, VendorPortalLinkView } from "@casamento/shared";
import type { Mailer } from "../mailer.ts";
import type { EventCtx } from "../tenancy/types.ts";
import { buildVendorPortalEmail, vendorPortalLink } from "../vendor-portal-email.ts";

/*
 * Fase 7, frente C: links mágicos do portal do fornecedor (lado do painel). O token (32 bytes,
 * base64url) só existe no e-mail e na resposta do POST; no banco fica o SHA-256. Vale `days`
 * dias, pode ser usado várias vezes e a equipe revoga quando quiser.
 */

const DAY = 24 * 60 * 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const newPortalToken = () => randomBytes(32).toString("base64url");
export const hashPortalToken = (token: string) => createHash("sha256").update(token).digest("hex");
/** Lixo no header nem vira consulta. */
export const isPortalTokenShape = (token: string) => TOKEN.test(token);

type LinkRecord = typeof vendorPortalLinks.$inferSelect;

export function toLinkView(r: LinkRecord, now: Date): VendorPortalLinkView {
  return {
    id: r.id,
    email: r.email,
    expiresAt: r.expiresAt.toISOString(),
    revokedAt: r.revokedAt?.toISOString() ?? null,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    status: r.revokedAt ? "revoked" : r.expiresAt <= now ? "expired" : "active",
  };
}

/** Fornecedor do evento com os dados do catálogo (null = não é deste evento). */
export async function findEventVendor(db: Database, ev: EventCtx, eventVendorId: number) {
  const [row] = await db
    .select({
      id: eventVendors.id,
      category: eventVendors.category,
      name: vendors.name,
      email: vendors.email,
    })
    .from(eventVendors)
    .innerJoin(
      vendors,
      and(
        eq(vendors.organizationId, eventVendors.organizationId),
        eq(vendors.id, eventVendors.vendorId),
      ),
    )
    .where(
      and(
        byEvent(eventVendors, ev),
        eq(eventVendors.id, eventVendorId),
        eq(vendors.organizationId, ev.orgId),
      ),
    );
  return row ?? null;
}

export async function listLinks(db: Database, ev: EventCtx, eventVendorId: number, now: Date) {
  const rows = await db
    .select()
    .from(vendorPortalLinks)
    .where(and(byEvent(vendorPortalLinks, ev), eq(vendorPortalLinks.eventVendorId, eventVendorId)))
    .orderBy(desc(vendorPortalLinks.createdAt), desc(vendorPortalLinks.id));
  return rows.map((r) => toLinkView(r, now));
}

export class PortalLinkError extends Error {
  readonly field: string | undefined;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

/** "dd/mm/aaaa" no fuso do evento. */
const localDay = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);

export interface CreateLinkDeps {
  db: Database;
  mailer: Mailer;
  authUrl: string;
}

/**
 * Cria o link e manda o e-mail. O e-mail padrão é o do catálogo; sem e-mail lá e sem `email`
 * no pedido → erro de campo. Falha no envio não desfaz o link: a equipe copia o endereço.
 */
export async function createLink(
  deps: CreateLinkDeps,
  ev: EventCtx,
  vendor: NonNullable<Awaited<ReturnType<typeof findEventVendor>>>,
  input: VendorPortalLinkInput,
  actor: { id: string },
  now: Date,
) {
  const email = input.email ?? vendor.email;
  if (!email) {
    throw new PortalLinkError(
      "Este fornecedor não tem e-mail no catálogo. Informe o e-mail para enviar o link.",
      "email",
    );
  }
  const token = newPortalToken();
  const expiresAt = new Date(now.getTime() + input.days * DAY);
  const [res] = await deps.db.insert(vendorPortalLinks).values({
    eventId: ev.id,
    eventVendorId: vendor.id,
    tokenHash: hashPortalToken(token),
    email,
    expiresAt,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  });
  const [row] = await deps.db
    .select()
    .from(vendorPortalLinks)
    .where(and(byEvent(vendorPortalLinks, ev), eq(vendorPortalLinks.id, res.insertId)));
  const url = vendorPortalLink(deps.authUrl, token);
  let emailSent = true;
  try {
    await deps.mailer.send(
      buildVendorPortalEmail({
        to: email,
        link: url,
        eventName: ev.name,
        vendorName: vendor.name,
        validUntil: localDay(expiresAt, ev.timezone),
      }),
    );
  } catch (err) {
    console.error("[portal do fornecedor] falha ao enviar o e-mail:", err);
    emailSent = false;
  }
  return { link: toLinkView(row!, now), url, emailSent };
}

export async function revokeLink(
  db: Database,
  ev: EventCtx,
  eventVendorId: number,
  linkId: number,
  now: Date,
): Promise<VendorPortalLinkView | null> {
  const where = and(
    byEvent(vendorPortalLinks, ev),
    eq(vendorPortalLinks.eventVendorId, eventVendorId),
    eq(vendorPortalLinks.id, linkId),
  );
  const [row] = await db.select().from(vendorPortalLinks).where(where);
  if (!row) return null;
  if (!row.revokedAt) {
    await db.update(vendorPortalLinks).set({ revokedAt: now, updatedAt: now }).where(where);
  }
  const [after] = await db.select().from(vendorPortalLinks).where(where);
  return toLinkView(after!, now);
}
