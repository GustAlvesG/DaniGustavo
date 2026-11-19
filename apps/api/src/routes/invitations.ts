import { getConnInfo } from "@hono/node-server/conninfo";
import {
  and,
  asc,
  eq,
  eventSettings,
  guests,
  invitations,
  LEGACY_EVENT_ID,
  rsvpLogs,
  type Database,
} from "@casamento/db";
import {
  ERROR_CODES,
  Invitation,
  LookupRequest,
  LookupResponse,
  RsvpRequest,
  RsvpResponse,
} from "@casamento/shared";
import { Hono, type Context } from "hono";
import type { Env } from "../env.ts";
import { apiError } from "../errors.ts";
import type { Mailer } from "../mailer.ts";
import { nameMatches } from "../names.ts";
import type { RateLimiter } from "../rate-limit.ts";
import { buildRsvpEmail } from "../rsvp-email.ts";

export interface InvitationDeps {
  env: Env;
  db: Database;
  mailer: Mailer;
  limiter: RateLimiter;
  now: () => Date;
}

const MINUTE = 60_000;
export const LOOKUP_LIMIT = 5;
export const RSVP_LIMIT = 10;

/**
 * IP do convidado. O Next repassa em `X-Client-Ip`; só confiamos nele porque as rotas de
 * escrita exigem `X-Web-Key` (middleware). Sem o header, usa o endereço do socket.
 */
export function clientIp(c: Context): string {
  const forwarded = c.req.header("x-client-ip")?.trim();
  if (forwarded) return forwarded.slice(0, 45);
  try {
    return getConnInfo(c).remote.address ?? "desconhecido";
  } catch {
    return "desconhecido";
  }
}

async function getSetting(db: Database, key: string): Promise<unknown> {
  const [row] = await db
    .select()
    .from(eventSettings)
    .where(and(eq(eventSettings.eventId, LEGACY_EVENT_ID), eq(eventSettings.key, key)));
  if (!row)
    throw new Error(`Configuração "${key}" não existe na tabela event_settings. Rode db:seed.`);
  return row.value;
}

async function loadInvitation(db: Database, token: string, now: Date) {
  const [inv] = await db.select().from(invitations).where(eq(invitations.token, token));
  if (!inv) return null;
  const rows = await db
    .select()
    .from(guests)
    .where(eq(guests.invitationId, inv.id))
    .orderBy(asc(guests.isPlusOne), asc(guests.id));
  const deadline = String(await getSetting(db, "rsvp.deadline"));
  const dto: Invitation = Invitation.parse({
    label: inv.label,
    side: inv.side,
    maxGuests: inv.maxGuests,
    allowPlusOne: inv.allowPlusOne,
    guests: rows.map((g) => ({
      id: g.id,
      name: g.name,
      isChild: g.isChild,
      ageRange: g.ageRange,
      isPlusOne: g.isPlusOne,
      rsvpStatus: g.rsvpStatus,
      dietaryNotes: g.dietaryNotes,
    })),
    contact: { email: inv.contactEmail, phone: inv.contactPhone },
    deadline,
    isClosed: now.getTime() > new Date(deadline).getTime(),
  });
  return { inv, dto };
}

function tooMany(c: Context, retryAfter: number) {
  return apiError(
    c,
    429,
    ERROR_CODES.tooManyRequests,
    `Muitas tentativas em pouco tempo. Aguarde ${retryAfter} segundos e tente de novo.`,
    { "Retry-After": String(retryAfter) },
  );
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

const badBody = (c: Context, message = "Corpo da requisição inválido. Envie um JSON.") =>
  apiError(c, 422, ERROR_CODES.invalidRequest, message);

function invitationNotFound(c: Context) {
  return apiError(
    c,
    404,
    ERROR_CODES.notFound,
    "Convite não encontrado. Confira o link que você recebeu ou busque pelo seu nome em /confirmar.",
  );
}

export function invitationRoutes(deps: InvitationDeps) {
  const { db, env, mailer, limiter, now } = deps;
  const app = new Hono();

  async function sendConfirmation(invitation: Invitation, to: string, token: string) {
    const [coupleNames, weddingDatetime, timezone] = await Promise.all([
      getSetting(db, "couple.names"),
      getSetting(db, "wedding.datetime"),
      getSetting(db, "wedding.timezone"),
    ]);
    await mailer.send(
      buildRsvpEmail({
        to,
        invitation,
        token,
        siteUrl: env.SITE_URL,
        coupleNames: String(coupleNames),
        weddingDatetime: String(weddingDatetime),
        timezone: String(timezone),
      }),
    );
  }

  app.post("/lookup", async (c) => {
    const ip = clientIp(c);
    const limit = limiter.hit(`lookup:${ip}`, LOOKUP_LIMIT, MINUTE);
    if (!limit.allowed) return tooMany(c, limit.retryAfter);

    const parsed = LookupRequest.safeParse(await readJson(c));
    if (!parsed.success) return badBody(c, parsed.error.issues[0]?.message);
    const { firstName, lastName, website } = parsed.data;

    const notFound = () =>
      apiError(
        c,
        404,
        ERROR_CODES.notFound,
        "Não encontramos esse nome na lista. Confira a grafia e tente de novo com o nome e o sobrenome do convite, ou fale com os noivos.",
      );
    // Honeypot: o robô recebe a mesma resposta de "sem resultado".
    if (website && website.trim() !== "") return notFound();

    const rows = await db
      .select({ name: guests.name, token: invitations.token, label: invitations.label })
      .from(guests)
      .innerJoin(invitations, eq(guests.invitationId, invitations.id));
    const found = new Map<string, string>();
    for (const r of rows) {
      if (nameMatches(r.name, firstName, lastName)) found.set(r.token, r.label);
    }
    if (found.size === 0) return notFound();

    c.header("Cache-Control", "no-store");
    return c.json(
      LookupResponse.parse({ matches: [...found].map(([token, label]) => ({ token, label })) }),
    );
  });

  app.get("/:token", async (c) => {
    const loaded = await loadInvitation(db, c.req.param("token"), now());
    if (!loaded) return invitationNotFound(c);
    c.header("Cache-Control", "no-store");
    return c.json(loaded.dto);
  });

  app.put("/:token/rsvp", async (c) => {
    const ip = clientIp(c);
    const limit = limiter.hit(`rsvp:${ip}`, RSVP_LIMIT, MINUTE);
    if (!limit.allowed) return tooMany(c, limit.retryAfter);

    const token = c.req.param("token");
    const loaded = await loadInvitation(db, token, now());
    if (!loaded) return invitationNotFound(c);
    const { inv, dto } = loaded;
    c.header("Cache-Control", "no-store");

    const body = await readJson(c);
    if (typeof body !== "object" || body === null) return badBody(c);

    // Honeypot: finge sucesso sem gravar nada.
    const trap = (body as { website?: unknown }).website;
    if (typeof trap === "string" && trap.trim() !== "") {
      return c.json(RsvpResponse.parse({ ok: true, invitation: dto }));
    }

    if (dto.isClosed) {
      const contact = (await getSetting(db, "couple.contact")) as {
        whatsapp?: string;
        email?: string;
      };
      const how = [contact.email, contact.whatsapp ? `WhatsApp ${contact.whatsapp}` : ""]
        .filter(Boolean)
        .join(" ou ");
      return apiError(
        c,
        409,
        ERROR_CODES.rsvpClosed,
        `O prazo para confirmar presença terminou. Para alterar a resposta, fale direto com os noivos${how ? `: ${how}` : ""}.`,
      );
    }

    const parsed = RsvpRequest.safeParse(body);
    if (!parsed.success) return badBody(c, parsed.error.issues[0]?.message);
    const req = parsed.data;

    // Convidados do convite. O acompanhante (+1) é tratado à parte, por plusOneName.
    const named = dto.guests.filter((g) => !g.isPlusOne);
    const namedIds = new Set(named.map((g) => g.id));
    const plusOneIds = new Set(dto.guests.filter((g) => g.isPlusOne).map((g) => g.id));
    const answers = new Map<number, (typeof req.guests)[number]>();
    for (const a of req.guests) {
      if (plusOneIds.has(a.id)) continue;
      if (!namedIds.has(a.id)) {
        return badBody(
          c,
          "Esse convidado não pertence a este convite. Recarregue a página e tente de novo.",
        );
      }
      answers.set(a.id, a);
    }
    if (answers.size !== named.length) {
      return badBody(
        c,
        "Responda por todos os convidados do convite: diga quem vai e quem não vai.",
      );
    }

    const attendingCount = [...answers.values()].filter((a) => a.attending).length;
    const plusOneName = req.plusOneName ?? null;
    if (plusOneName) {
      if (!inv.allowPlusOne) {
        return badBody(c, "Este convite não inclui acompanhante. Retire o nome e envie de novo.");
      }
      if (attendingCount === 0) {
        return badBody(c, "Para levar acompanhante, confirme a sua presença primeiro.");
      }
      if (attendingCount + 1 > inv.maxGuests) {
        return badBody(
          c,
          `Este convite tem lugar para ${inv.maxGuests} pessoas. Retire o acompanhante ou ajuste a lista.`,
        );
      }
    }

    const moment = now();
    await db.transaction(async (tx) => {
      for (const [id, a] of answers) {
        await tx
          .update(guests)
          .set({
            rsvpStatus: a.attending ? "confirmed" : "declined",
            dietaryNotes: a.attending ? (a.dietaryNotes ?? null) : null,
            respondedAt: moment,
          })
          .where(eq(guests.id, id));
      }

      const existingPlusOne = dto.guests.find((g) => g.isPlusOne);
      if (plusOneName) {
        if (existingPlusOne) {
          await tx
            .update(guests)
            .set({ name: plusOneName, rsvpStatus: "confirmed", respondedAt: moment })
            .where(eq(guests.id, existingPlusOne.id));
        } else {
          await tx.insert(guests).values({
            invitationId: inv.id,
            name: plusOneName,
            isPlusOne: true,
            rsvpStatus: "confirmed",
            respondedAt: moment,
          });
        }
      } else if (existingPlusOne) {
        await tx.delete(guests).where(eq(guests.id, existingPlusOne.id));
      }

      const contactUpdate: { contactEmail?: string | null; contactPhone?: string | null } = {};
      if (req.contact?.email !== undefined) contactUpdate.contactEmail = req.contact.email;
      if (req.contact?.phone !== undefined) contactUpdate.contactPhone = req.contact.phone;
      if (Object.keys(contactUpdate).length > 0) {
        await tx.update(invitations).set(contactUpdate).where(eq(invitations.id, inv.id));
      }

      const logged = { ...req, website: undefined };
      await tx.insert(rsvpLogs).values({ invitationId: inv.id, payload: logged, ip });
    });

    const updated = await loadInvitation(db, token, now());
    if (!updated) return invitationNotFound(c);

    const to = updated.dto.contact.email;
    if (to) {
      // Sem await: o convidado não espera o SMTP. Falha de envio só vai para o log.
      void sendConfirmation(updated.dto, to, token).catch((err: unknown) => {
        console.error("Falha ao enviar o e-mail de confirmação:", err);
      });
    }

    return c.json(RsvpResponse.parse({ ok: true, invitation: updated.dto }));
  });

  return app;
}
