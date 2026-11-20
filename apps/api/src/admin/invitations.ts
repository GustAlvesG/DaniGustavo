import {
  and,
  asc,
  byEvent,
  desc,
  eq,
  guests,
  inArray,
  invitations,
  newPublicId,
  rsvpLogs,
  type Database,
} from "@casamento/db";
import {
  AdminInvitationInput,
  InvitationStatus,
  type AdminGuest,
  type AdminInvitation,
  type AdminRsvpLog,
  sideLabel,
  type RsvpStatus,
} from "@casamento/shared";
import { Hono } from "hono";
import { invalid, iso, notFound, readJson, sensitiveLimit } from "./context.ts";
import { requirePermission } from "../tenancy/permissions.ts";
import { resolverFor } from "../tenancy/resolver.ts";
import type { EventAdminEnv, EventCtx } from "../tenancy/types.ts";
import { eventBaseUrl } from "../tenancy/urls.ts";
import type { AdminDeps } from "./context.ts";
import { eventSides } from "./event-config.ts";

type InvitationRow = typeof invitations.$inferSelect;
type GuestRow = typeof guests.$inferSelect;

/** Convite confirmado se alguém vai; recusado se todos responderam não; senão pendente. */
export function invitationStatus(list: Pick<GuestRow, "rsvpStatus">[]): InvitationStatus {
  if (list.some((g) => g.rsvpStatus === "confirmed")) return "confirmed";
  if (list.length > 0 && list.every((g) => g.rsvpStatus === "declined")) return "declined";
  return "pending";
}

export const invitationLink = (siteUrl: string, token: string) =>
  `${siteUrl.replace(/\/+$/, "")}/c/${token}`;

function guestDto(g: GuestRow): AdminGuest {
  return {
    id: g.id,
    name: g.name,
    isChild: g.isChild,
    ageRange: g.ageRange,
    isPlusOne: g.isPlusOne,
    rsvpStatus: g.rsvpStatus,
    dietaryNotes: g.dietaryNotes,
    phone: g.phone,
    email: g.email,
    respondedAt: iso(g.respondedAt),
  };
}

function invitationDto(siteUrl: string, inv: InvitationRow, list: GuestRow[]): AdminInvitation {
  return {
    id: inv.id,
    token: inv.token,
    label: inv.label,
    side: inv.side,
    maxGuests: inv.maxGuests,
    allowPlusOne: inv.allowPlusOne,
    contactEmail: inv.contactEmail,
    contactPhone: inv.contactPhone,
    sentAt: iso(inv.sentAt),
    status: invitationStatus(list),
    link: invitationLink(siteUrl, inv.token),
    guests: list.map(guestDto),
    updatedAt: inv.updatedAt.toISOString(),
  };
}

async function loadAll(ev: EventCtx, db: Database) {
  const [invs, gs] = await Promise.all([
    db.select().from(invitations).where(byEvent(invitations, ev)).orderBy(asc(invitations.label)),
    db
      .select()
      .from(guests)
      .where(byEvent(guests, ev))
      .orderBy(asc(guests.isPlusOne), asc(guests.id)),
  ]);
  const byInv = new Map<number, GuestRow[]>();
  for (const g of gs) {
    const list = byInv.get(g.invitationId) ?? [];
    list.push(g);
    byInv.set(g.invitationId, list);
  }
  return invs.map((inv) => ({ inv, guests: byInv.get(inv.id) ?? [] }));
}

async function loadOne(ev: EventCtx, db: Database, id: number) {
  const [inv] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, id), byEvent(invitations, ev)));
  if (!inv) return null;
  const list = await db
    .select()
    .from(guests)
    .where(and(eq(guests.invitationId, id), byEvent(guests, ev)))
    .orderBy(asc(guests.isPlusOne), asc(guests.id));
  return { inv, guests: list };
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Resumo legível de uma resposta de RSVP (o payload guardado em rsvp_logs, sem o IP). */
export function describeRsvp(payload: unknown, names: Map<number, string>): string[] {
  const p = (payload ?? {}) as {
    guests?: { id?: number; attending?: boolean; dietaryNotes?: string | null }[];
    plusOneName?: string | null;
    contact?: { email?: string | null; phone?: string | null };
  };
  const lines: string[] = [];
  for (const g of p.guests ?? []) {
    const name = (g.id !== undefined && names.get(g.id)) || "Convidado removido";
    let line = `${name}: ${g.attending ? "vai" : "não vai"}`;
    if (g.dietaryNotes) line += ` (restrição: ${g.dietaryNotes})`;
    lines.push(line);
  }
  if (p.plusOneName) lines.push(`Acompanhante: ${p.plusOneName}`);
  if (p.contact?.email || p.contact?.phone) {
    lines.push(`Contato: ${[p.contact.email, p.contact.phone].filter(Boolean).join(" · ")}`);
  }
  return lines.length ? lines : ["Resposta sem convidados."];
}

/* ------------------------------------------------------------------------ */
/* CSV                                                                       */
/* ------------------------------------------------------------------------ */

const AGE_LABEL: Record<string, string> = { "0-2": "0 a 2 anos", "3-7": "3 a 7", "8-12": "8 a 12" };
const STATUS_LABEL: Record<RsvpStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  declined: "Não vai",
};

/** Célula de CSV: aspas quando preciso e neutraliza fórmulas (=, +, -, @) do Excel. */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV no formato do Excel brasileiro: separador ";" e BOM UTF-8 (acentos certos). */
export function toCsv(rows: (string | number | null)[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------------ */
/* Rotas                                                                     */
/* ------------------------------------------------------------------------ */

export function adminInvitationRoutes(deps: AdminDeps) {
  const { db, env, now } = deps;
  const app = new Hono<EventAdminEnv>();
  const resolver = resolverFor(db, deps.eventResolver);
  const baseUrl = (ev: EventCtx) => eventBaseUrl(ev, { env, resolver });
  app.on("GET", "*", requirePermission("invitations.read"));
  app.on(["POST", "PUT", "PATCH", "DELETE"], "*", requirePermission("invitations.write"));

  app.get("/", async (c) => {
    const q = fold(c.req.query("q")?.trim() ?? "");
    const status = InvitationStatus.safeParse(c.req.query("status"));
    const base = await baseUrl(c.get("event"));
    const all = (await loadAll(c.get("event"), db)).map(({ inv, guests: g }) =>
      invitationDto(base, inv, g),
    );
    const list = all.filter(
      (i) =>
        (!status.success || i.status === status.data) &&
        (!q || fold(i.label).includes(q) || i.guests.some((g) => fold(g.name).includes(q))),
    );
    return c.json({ invitations: list, total: all.length });
  });

  app.get("/export.csv", async (c) => {
    const wanted = c.req.query("status") ?? "confirmed";
    const all = await loadAll(c.get("event"), db);
    const sides = await eventSides(c.get("event"), db);
    const rows: (string | number | null)[][] = [
      [
        "Convidado",
        "Convite",
        "Lado",
        "Situação",
        "Adulto/criança",
        "Faixa etária",
        "Restrição alimentar",
        "Telefone",
        "E-mail",
      ],
    ];
    for (const { inv, guests: list } of all) {
      for (const g of list) {
        if (wanted !== "all" && g.rsvpStatus !== wanted) continue;
        rows.push([
          g.name,
          inv.label,
          sideLabel(sides, inv.side),
          STATUS_LABEL[g.rsvpStatus],
          g.isChild ? "Criança" : "Adulto",
          g.ageRange ? (AGE_LABEL[g.ageRange] ?? g.ageRange) : "",
          g.dietaryNotes,
          g.phone ?? inv.contactPhone,
          g.email ?? inv.contactEmail,
        ]);
      }
    }
    const name = wanted === "all" ? "convidados" : `convidados-${wanted}`;
    return c.body(toCsv(rows), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
    });
  });

  app.get("/:id{[0-9]+}", async (c) => {
    const ev = c.get("event");
    const id = Number(c.req.param("id"));
    const found = await loadOne(ev, db, id);
    if (!found) return notFound(c, "Convite");
    const logs = await db
      .select({ id: rsvpLogs.id, payload: rsvpLogs.payload, createdAt: rsvpLogs.createdAt })
      .from(rsvpLogs)
      .where(and(eq(rsvpLogs.invitationId, id), byEvent(rsvpLogs, ev)))
      .orderBy(desc(rsvpLogs.createdAt))
      .limit(50);
    const names = new Map(found.guests.map((g) => [g.id, g.name]));
    const responses: AdminRsvpLog[] = logs.map((l) => ({
      id: l.id,
      createdAt: l.createdAt.toISOString(),
      lines: describeRsvp(l.payload, names),
    }));
    return c.json({
      invitation: invitationDto(await baseUrl(ev), found.inv, found.guests),
      responses,
    });
  });

  app.post("/", async (c) => {
    const ev = c.get("event");
    const parsed = AdminInvitationInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const input = parsed.data;
    const sides = await eventSides(ev, db);
    if (!sides.some((s) => s.key === input.side)) {
      return invalid(c, [{ message: "Esse lado não existe neste evento. Escolha um da lista." }]);
    }
    const moment = now();
    const id = await db.transaction(async (tx) => {
      const [res] = await tx.insert(invitations).values({
        eventId: ev.id,
        token: newPublicId(),
        label: input.label,
        side: input.side,
        maxGuests: input.maxGuests,
        allowPlusOne: input.allowPlusOne,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        createdAt: moment,
        updatedAt: moment,
      });
      await tx.insert(guests).values(
        input.guests.map((g) => ({
          eventId: ev.id,
          invitationId: res.insertId,
          name: g.name,
          isChild: g.isChild,
          ageRange: g.isChild ? g.ageRange : null,
          rsvpStatus: g.rsvpStatus,
          dietaryNotes: g.dietaryNotes,
          phone: g.phone,
          email: g.email,
          respondedAt: g.rsvpStatus === "pending" ? null : moment,
        })),
      );
      return res.insertId;
    });
    const found = await loadOne(ev, db, id);
    return c.json({ invitation: invitationDto(await baseUrl(ev), found!.inv, found!.guests) }, 201);
  });

  app.put("/:id{[0-9]+}", async (c) => {
    const ev = c.get("event");
    const id = Number(c.req.param("id"));
    const parsed = AdminInvitationInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const input = parsed.data;
    const sides = await eventSides(ev, db);
    if (!sides.some((s) => s.key === input.side)) {
      return invalid(c, [{ message: "Esse lado não existe neste evento. Escolha um da lista." }]);
    }
    const current = await loadOne(ev, db, id);
    if (!current) return notFound(c, "Convite");
    const existing = new Map(current.guests.map((g) => [g.id, g]));
    if (input.guests.some((g) => g.id !== undefined && !existing.has(g.id))) {
      return invalid(c, [
        { message: "Um dos convidados não pertence a este convite. Recarregue." },
      ]);
    }
    const moment = now();
    await db.transaction(async (tx) => {
      await tx
        .update(invitations)
        .set({
          label: input.label,
          side: input.side,
          maxGuests: input.maxGuests,
          allowPlusOne: input.allowPlusOne,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
        })
        .where(and(eq(invitations.id, id), byEvent(invitations, ev)));
      const keep = new Set<number>();
      for (const g of input.guests) {
        const values = {
          name: g.name,
          isChild: g.isChild,
          ageRange: g.isChild ? g.ageRange : null,
          rsvpStatus: g.rsvpStatus,
          dietaryNotes: g.dietaryNotes,
          phone: g.phone,
          email: g.email,
        };
        if (g.id !== undefined) {
          keep.add(g.id);
          const before = existing.get(g.id)!;
          const respondedAt =
            before.rsvpStatus === g.rsvpStatus
              ? before.respondedAt
              : g.rsvpStatus === "pending"
                ? null
                : moment;
          await tx
            .update(guests)
            .set({ ...values, respondedAt })
            .where(and(eq(guests.id, g.id), byEvent(guests, ev)));
        } else {
          await tx.insert(guests).values({
            ...values,
            eventId: ev.id,
            invitationId: id,
            respondedAt: g.rsvpStatus === "pending" ? null : moment,
          });
        }
      }
      const removed = current.guests.filter((g) => !keep.has(g.id)).map((g) => g.id);
      if (removed.length)
        await tx.delete(guests).where(and(inArray(guests.id, removed), byEvent(guests, ev)));
    });
    const found = await loadOne(ev, db, id);
    return c.json({ invitation: invitationDto(await baseUrl(ev), found!.inv, found!.guests) });
  });

  app.delete("/:id{[0-9]+}", async (c) => {
    const ev = c.get("event");
    const id = Number(c.req.param("id"));
    const [res] = await db
      .delete(invitations)
      .where(and(eq(invitations.id, id), byEvent(invitations, ev)));
    if (res.affectedRows === 0) return notFound(c, "Convite");
    return c.json({ ok: true });
  });

  /** Gera um token novo: o link antigo deixa de funcionar. */
  app.post("/:id{[0-9]+}/token", sensitiveLimit(deps.limiter, "token"), async (c) => {
    const ev = c.get("event");
    const id = Number(c.req.param("id"));
    const [res] = await db
      .update(invitations)
      .set({ token: newPublicId(), sentAt: null })
      .where(and(eq(invitations.id, id), byEvent(invitations, ev)));
    if (res.affectedRows === 0) return notFound(c, "Convite");
    const found = await loadOne(ev, db, id);
    return c.json({ invitation: invitationDto(await baseUrl(ev), found!.inv, found!.guests) });
  });

  /** Marca como enviado (o painel chama ao abrir o WhatsApp ou copiar o link). */
  app.post("/:id{[0-9]+}/sent", async (c) => {
    const ev = c.get("event");
    const id = Number(c.req.param("id"));
    const [res] = await db
      .update(invitations)
      .set({ sentAt: now() })
      .where(and(eq(invitations.id, id), byEvent(invitations, ev)));
    if (res.affectedRows === 0) return notFound(c, "Convite");
    return c.json({ ok: true });
  });

  return app;
}
